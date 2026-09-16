# Operating Graham

Day-to-day commands and habits. Setup lives in the [README](../README.md); this is
what to do once it is set up. What the app is for lives in
[PRODUCT_SPEC](PRODUCT_SPEC.md); this is how to run it.

## Which Graham am I looking at?

Ask this before debugging anything. There are four configurations, they look
almost identical on screen, and three of them have different data.

| Configuration | App talks to | Data you see | Started by |
| --- | --- | --- | --- |
| **Demo** | nothing | 8 watches hardcoded in `src/lib/demo.ts` | `npm run demo:web` |
| **Local** | `127.0.0.1:54321` | whatever you imported; `db:reset` wipes it | `npm run web` / `ios`, with `.env.local` present |
| **Hosted** | `hbxgxtbtefpyutyqafoi.supabase.co` | real dealers and real watches | same commands, with `.env.local` deleted |
| **EAS build** | whatever `eas env` says | depends | `eas build` |

The switch is file presence, not a flag. `.env` holds the hosted pair and
`.env.local` holds the local pair; Expo loads `.env.local` at higher precedence,
so **the file existing is what puts you on local.** Delete it and the same
commands ship your keystrokes to production. `npm run check:env` prints nothing
when the pair is coherent, so silence is not confirmation of which one you are
on — read the URL Metro prints, or run:

```
node -e "console.log(require('fs').existsSync('.env.local') ? 'LOCAL' : 'HOSTED')"
```

### The app and the operator scripts point at different backends

This is the one that wastes an afternoon. Right now:

- The **app** reads `.env.local` → **local**.
- The **operator scripts** read `scripts/.env.operator.local` → **hosted**.

So `npm run dealers` lists production shops that the simulator in front of you
cannot see, and `npm run import` spends real OpenAI credit writing rows the app
will not show. Neither prints a warning. Check with `head -1
scripts/.env.operator.local` before running anything that writes.

Do not delete the file to get back to local: `node --env-file` hard-fails on a
missing path, so every operator command dies with `not found`. Override instead
— an exported variable wins over `--env-file`:

```
eval "$(supabase status -o env | sed -E 's/^API_URL=/export SUPABASE_URL=/;
  s/^ANON_KEY=/export SUPABASE_ANON_KEY=/;
  s/^SERVICE_ROLE_KEY=/export SUPABASE_SERVICE_ROLE_KEY=/' \
  | grep '^export SUPABASE_')"
npm run dealers        # now reads local
```

Those exports last for the shell, so open a new terminal to go back to hosted.
`npm run test:rls` needs none of this — it refuses to run anywhere but local,
because it creates and deletes users.

## Hosted is behind local

Hosted is not a mirror of your machine and nothing keeps it in step. As of this
branch it is **seven migrations and one function behind**, which makes most of
the dealer work invisible there. Check before blaming the code:

```
npx supabase migration list      # local vs remote, side by side
npx supabase functions list      # what is actually deployed
npx supabase secrets list        # names only, values are hashed
```

What is missing on hosted today, and what it looks like if you test there:

| Not on hosted | Symptom if you try it there |
| --- | --- |
| `dealer_applications` + `my_dealer_application` | Apply screen fails; PostgREST says the relation does not exist |
| `answer_dealer_application` | `dealers -- accept` / `decline` fail with PGRST202 |
| `avatar_storage` | Picking a profile photo fails: no such bucket |
| `replace_listing_photos` | Photo refresh reports success and changes nothing |
| `import_job_ledger` | The import rate limit can be reset by the account it bills |
| `inquiry_targets_its_listing` | An inquiry can name a dealer who never carried the watch |
| `verify-application` function | The application code email never sends |
| `RESEND_API_KEY` / `SMTP_HOST` | **No mail sends at all** — sign-in codes, claim codes, inquiries |
| `SCRAPE_PROVIDER` / `JINA_API_KEY` | Imports fall back to plain `fetch`, so JavaScript-rendered shops read as empty |

That last pair of rows means hosted Graham cannot currently email anyone. Treat
it as a deploy that has not happened, not a bug to hunt. Closing the gap is
three commands, and they are writes to production — run them deliberately:

```
supabase db push
supabase functions deploy verify-application
supabase secrets set RESEND_API_KEY=... SCRAPE_PROVIDER=jina
```

## Three processes

Almost every confusing failure is one of these being down. Ask "which of the three?"
before anything else.

1. **Colima** — the Linux VM that runs containers. The database lives inside it.
2. **Supabase** — ten containers: Postgres, auth, the REST API, Studio, the mail catcher.
3. **Metro** — Expo's bundler. Compiles TypeScript into one JavaScript file and serves
   it to the simulator or browser. It prints `Bundled 3458ms`.

## Starting cold

Colima does not start itself after a reboot. When the database seems to have vanished
and `npm run db:start` fails with a Docker error, this is why.

```
colima start
npm run db:start
npm run ios        # or npm run web
```

Shutting down is the reverse. `colima stop` returns about 8GB of RAM.

## Running the app

| Command | Opens |
| --- | --- |
| `npm run web` | Browser. Fastest loop. |
| `npm run ios` | iOS Simulator via Expo Go |
| `npm run start:dev` | A development build already installed on a device |
| `npm run demo:web` | Fixtures only, no backend needed |

With the dev server running, the terminal takes single keypresses:

| Key | Does |
| --- | --- |
| `i` / `w` | Open iOS Simulator / browser |
| `r` | Reload the app |
| `m` | Toggle the dev menu on the device |
| `j` | Open the debugger |
| Ctrl+C | Stop the server |

In the simulator: `Cmd+R` reloads, `Cmd+D` opens the dev menu, `Cmd+Shift+A` toggles
dark mode. That last one is how you check theme work.

Usually you reload nothing. Save a file and Fast Refresh swaps the changed component
in place, keeping app state and the screen you are on.

## When a reload is not enough

Four things are baked in when Metro *starts*. Change one and a reload does nothing —
stop the server and start it again.

- `.env` or `.env.local` (environment variables are inlined at bundle time)
- Installing or removing a package
- `app.json`
- Metro or Babel config

Still stale or behaving strangely? `npx expo start --clear` wipes Metro's cache.

## How the app works

One binary, two sides, and an operator who is not in the app at all.

### The three gates

Most "why can't this account do that" questions are one of these three, and they
are deliberately separate. Confusing them is the most common way to misread a
bug as broken when it is working.

| Column | Means | Set by |
| --- | --- | --- |
| `profiles.account_type` | Which door they picked at sign-up. **Routing only — proves nothing.** | The user, freely |
| `dealers.claimed_by` | This account controls this shop: reads hidden listings, edits them, sees inquiries, refreshes the catalogue | Proving a mailbox on the shop's domain |
| `dealers.permission` | Whether this shop's watches reach buyers' decks | An operator, from the CLI only |

`account_type` grants nothing on purpose. A dealer who picks "buyer" loses no
power, and a buyer who picks "dealer" gains none — they just see a different
first screen. Every dealer power comes from `claimed_by`.

`permission` is unreachable from the app by RLS, so a shop can never publish its
own inventory. That is why importing a shop does not make it visible.

### The buyer path

Deck of one watch at a time (`(tabs)/index`) → swipe right saves, left passes →
Saved tab → a listing → **Ask about this watch**. The inquiry is the only thing
that emails a dealer, and it is a separate deliberate act, never a side effect
of saving.

Search is the same catalogue as a list with filters. Both read `search_listings`,
which only returns watches that are active, unsold, and belong to an approved
shop. A watch missing from the deck is nearly always one of those three.

### The dealer path

One door, whichever side of the import the shop is on: Profile → Claim your
shop → they type the site they sell from (`ShopIntake`). The answer forks, and
the dealer never has to know which branch they are in, because they have no way
of knowing whether we scraped them.

- **We already hold the shop** → they claim it with a code emailed to any
  mailbox on that domain.
- **We have never read the shop** → they file an application: shop name,
  brands, rough volume. Then they prove a mailbox on the domain they typed.

A verified application grants nothing. It is a request with a proved return
address, waiting for an operator. That ordering is the point: prove the mailbox,
then a human decides.

Once a shop is claimed, Profile becomes a workspace — inventory, listing edits,
photo management, and `import-inventory` to re-read their own site.

### The operator path

Not in the app. `npm run dealers` with the service-role key, because RLS blocks
approving a shop you created.

```
npm run dealers                          # who is in, and whether we can email them
npm run dealers -- add <domain>          # discover, preview, import, approve
npm run dealers -- set <id|host>         # re-read their name and address from their site
npm run dealers -- stats <id|host>       # saves and inquiries per watch
npm run dealers -- remove <id|host>      # delete them, their listings and their photos
npm run dealers -- approve <id|host>     # publish their listings
npm run dealers -- revoke <id|host>      # pull them back

npm run dealers -- applications          # shops asking to be listed
npm run dealers -- accept <app-id>       # turn one into a shop they own
npm run dealers -- decline <app-id>      # say no, with --note
```

`accept` and `approve` are different gates. Accepting hands a shop to the dealer
who applied for it; approving is what puts its listings in a deck. `accept
--hold` does the first without the second.

In `applications`, `●` means the mailbox is proved and `○` means it is not. An
unproved application cannot be accepted — the function refuses — so `○` is
waiting on the applicant, not on you. `decline` requires `--note`, because the
applicant reads it on their own profile and a decline with no reason is the dead
end the application flow exists to remove.

## Testing

### The four automated checks

| Command | Catches | Blind to |
| --- | --- | --- |
| `npm run typecheck` | Type errors in the app | Anything at runtime |
| `npx expo export --platform web` | Broken route tree, missing assets, bad imports | Logic |
| `deno check --config supabase/functions/deno.ci.json …` | Type errors in the four edge functions | Logic, and whether they are deployed |
| `npm run test:rls` | Every security policy, over HTTP, from a buyer's side of the wire | Anything above the database |

Run the first and last before every commit; both are seconds. CI runs all four
on every push and pull request:

| Job | Checks |
| --- | --- |
| `app` | `npm run typecheck`, then a web bundle |
| `edge functions` | `deno check` on all four functions |
| `database` | every migration from empty, `npm run test:rls`, generated types |

The bundle is there because `tsc` reads files and does not resolve the route tree.
A screen deleted while a navigator still registers it type-checks and then fails
on launch.

The edge functions are not part of the Expo program, so `npm run typecheck` has
never seen them. `deno check` is the only type check the import pipeline gets. It
runs with `--config supabase/functions/deno.ci.json`, which exists solely to stop
Deno walking up to the app's `package.json`; without it, checking four server
files resolves the whole Expo tree and any package published in the last day
fails Deno's dependency-age policy.

The types job regenerates `database.types.ts` and fails if it differs from the
committed file. A migration merged without `npm run db:types` means TypeScript is
lying about your columns, and nothing else notices.

The Supabase CLI version is pinned exactly in `package.json`, and CI pins the same
number in `.github/workflows/ci.yml`. Bump both together.

The pin is not cosmetic. 2.100.1 and 2.117.0 generate `database.types.ts` with
different punctuation in the generic helpers, so a file written by one version
fails the diff under the other — a red build that has nothing to do with the
schema.

`npm run` puts `node_modules/.bin` at the front of `PATH`, so every `db:*` script
uses the pinned binary no matter what `supabase` means in your shell. A bare
`supabase db reset` in a terminal does not: that is whatever Homebrew installed.
Check with `npm exec -- supabase --version` against `supabase --version`; if they
disagree, run schema commands through `npm run`.

None of the four proves the app works. There are no tests of the buyer or dealer
flows above the database, so those are walked by hand.

### What to run after what you changed

| After you change | Run |
| --- | --- |
| The schema | `npm run db:types`, then `npm run test:rls` |
| A security policy | `npm run test:rls` |
| An edge function | `deno check`, then `supabase functions serve <name>` |
| Which backend the app uses | `npm run check:env` |

`npm run db:reset` is the undo button: drops everything, re-runs every migration
in order, re-seeds. Nothing local is precious. Migrations are append-only once
they have run — never edit one, add a new file.

Two interfaces worth bookmarking:

- **Studio** http://127.0.0.1:54323 — browse and edit rows
- **Mailpit** http://127.0.0.1:54324 — every email the app sends

### Walking the buyer flow

A fresh local database has no watches, so the deck is empty and correct. Get one
shop in first — with the operator scripts pointed at local, or this imports into
production:

```
npm run db:reset
# then the export block from "The app and the operator scripts point at
# different backends" above, then:
npm run dealers -- add goldfingersvintage.com --limit 10 --yes
```

`add` discovers, previews, imports and approves in one pass, and takes about 15
seconds on a Squarespace shop — the adapter reads their JSON feed directly
rather than paying for a scrape and an extraction. Expect most of the catalogue
to be held back as sold; see the note in `supabase/seed.sql`. Then:

1. `npm run web`, sign in with any address.
2. Onboarding asks for a name — the inquiry email opens with it, so it is not optional.
3. Swipe the deck. Right saves, left passes.
4. Saved tab → a watch → **Ask about this watch**.
5. Read the mail in Mailpit. Check the Reply-To is your buyer address, not Graham's.

### Walking the dealer claim flow

Needs a shop whose `contact_email` you can receive at. Locally every address
works, because all mail goes to Mailpit.

1. `npm run dealers` and note a shop's website.
2. Sign in to the app as a *different* address than the shop's.
3. Profile → Claim your shop → type that website.
4. Ask for a code at any address on that domain.
5. Read the code in Mailpit, enter it.
6. Profile is now the shop's workspace: inventory, edits, import.

Worth confirming once: the shop's watches are already in the deck because `add`
approved it. Claiming changed who controls the shop, not whether it publishes.

### Walking the dealer application flow

The path for a shop we have never scraped, so pick a domain that is *not* in
`npm run dealers`.

1. Sign in as a new address, and pick **I sell watches** at sign-in.
2. Type a website we do not hold. The form becomes an application.
3. Fill in name, brands, volume. File it.
4. Prove a mailbox on that domain; the code arrives in Mailpit.
5. `npm run dealers -- applications` — it should show `●`.
6. `npm run dealers -- accept <app-id>`.
7. Back in the app, Profile is the shop's workspace.

Then walk the unhappy path, because it is the one users hit: file a second
application and confirm it is refused, `decline --note` one and confirm the note
appears on the applicant's profile, and confirm a declined applicant may reapply.

### Signing in locally

No email ever leaves your machine. Supabase runs a fake mail server, so sign-in
codes land in Mailpit instead of a real inbox — checking Gmail will never show one.

1. Type any address in the app. `a@b.c` works as well as your real one.
2. On the iOS Simulator or web, wait: the app reads the code from Mailpit and
   signs you in. Confirmation still happens; you just do not open the inbox.
3. On a physical phone, open http://127.0.0.1:54324 on the Mac and type the
   six digit code. The phone cannot reach Mailpit.

The account is created on first use. Codes expire after an hour.

That Mailpit-reading shortcut is gated on the Supabase URL being a local host,
not on `__DEV__`. Expo Go is always "dev" even when pointed at hosted, where
there is no Mailpit to read.

## Which failures are expected

Working-as-designed, so do not debug these:

| What you see | Why |
| --- | --- |
| Demo mode: dealer buttons and inquiries do nothing | `src/lib/demo.ts` fakes the buyer surfaces only — deck, search, saved, profile, one listing. Nothing else has a fixture. |
| An anon REST request returns zero rows | Listings are invisible unauthenticated by policy. Says nothing about whether data exists; count with the service-role key. |
| An imported shop's watches are not in any deck | `permission` is still `pending`. Needs `dealers -- approve`. |
| A watch vanishes from the deck | Sold, deactivated, or its shop was revoked. `search_listings` filters all three. |
| No email arrives in a real inbox, locally | Everything goes to Mailpit by design. |
| A dealer on `shop.com` cannot use `me@mail.shop.com` | The domain rule is the exact host with `www.` stripped, never a parent — otherwise anyone with a `squarespace.com` address could claim a Squarespace shop. |
| "Continue with Apple" is missing in Expo Go | Native module Expo Go cannot load. Needs a development build. |
| Apple and Google buttons missing everywhere | Both are written and switched off until they have credentials. |
| An application shows `○` and cannot be accepted | The applicant has not proved a mailbox yet. Waiting on them. |
| A second application is refused | One live application per account, by unique index. Answered ones free it. |
| The deck is empty on a fresh `db:reset` | There are no watches until you import a shop. |

Real bugs, by contrast, look like: a write that reports success and changes
nothing, an `import_jobs` row stuck at `running`, a photo gallery that is empty
while the listing is live, or an inquiry that reaches the wrong shop. Those are
the failure shapes the recent migrations were written to close, so if you see one
on hosted, check the migration table above before reading code.

## Reading failures

A red screen is a JavaScript error; the stack trace prints in the Metro terminal.
That terminal also carries `console.log` output from the device. A `Bundled` line
with a module count means the code compiled and any problem is at runtime.

Postgres errors arrive through PostgREST with codes worth recognising:

| Code | Means |
| --- | --- |
| `42501` | RLS or a definer function refused. An authorisation answer, not a crash. |
| `PGRST202` | No such function — almost always a migration not applied to that backend. |
| `PGRST116` | Expected one row, got none. Often RLS hiding it rather than absence. |
| `23505` | Unique violation. `dealers.website` and the one-live-application index both raise it. |

## Inquiry email

A buyer swipes right to save. Sending an inquiry is a separate, deliberate act, and
it is the only thing that emails a dealer. The mail comes from Graham with the
buyer's address as Reply-To, so the dealer's reply goes straight to them. It opens
with the buyer's name, which is why onboarding asks for one.

If the shop is unclaimed, a footer points them to sign in at `APP_ORIGIN/sign-in`
with that same address. Claiming still happens in the app; the footer is how they
find it, not proof they own the shop. Claimed shops get the lead only.

Locally the mail lands in Mailpit (http://127.0.0.1:54324), same inbox as sign-in
codes. In production set `RESEND_API_KEY` and the function uses Resend instead.
`APP_ORIGIN` defaults to `https://graham.app`; set it to the deployed web origin
so the footer link is real.

A send that fails leaves the inquiry at `failed`. The buyer can try again — the
second attempt reuses the same row rather than being told they already asked.

## How a shop gets claimed

A claim moves a dealer row's `claimed_by` to one account. That account can then
read the shop's hidden listings, edit every field on them, see its inquiries, and
refresh its catalogue. It does not change `permission` — whether a shop's watches
reach the deck stays an operator decision, made with `npm run dealers -- approve`.

Two ways in, and both prove a mailbox:

1. **The address on the site.** Sign in with the address in `dealers.contact_email`
   and the shop appears on Profile behind **Claim this shop**. The sign-in code
   already proved that mailbox, so there is nothing more to check.
2. **Any mailbox on the shop's domain.** Profile → **Claim your shop**. The dealer
   types their website, gets a code at `whoever@their-domain.com`, and enters it.
   This is the path for a shop that publishes `info@shop.com` but reads it from a
   personal login, or publishes a Gmail address — the account doing the claiming
   can be any address.

A shop we have never read has neither, which is what applications are for. They
share one code implementation: `claim_code_digest`, plus the same limits table.

Codes live 15 minutes, five wrong guesses burn one, three outstanding per shop per
account, and a code is spendable only by the account that asked for it — so
forwarding the email hands over nothing. `dealer_claim_codes` has RLS on and no
policies: only the edge functions write it, and only the definer functions spend
it. Codes are stored as a salted SHA-256, never in the clear.

The domain rule is the exact host with `www.` stripped, never a parent. Taking the
registrable domain would read `goldfinger.squarespace.com` as `squarespace.com`
and let anyone with an address there claim the shop. The cost is that a dealer at
`shop.com` cannot use `me@mail.shop.com`; they use the published-address path.

`enable_confirmations` must stay on. With it off GoTrue stamps `email_confirmed_at`
the moment anyone posts to `/auth/v1/signup`, which made path 1 a takeover: sign up
as the address a shop prints on its own contact page and the shop was yours.
`dealer_accounts` and `claim_dealer` also check `email_confirmed_at` directly, so
flipping the dashboard toggle cannot quietly reopen it.

There is no way in the app to move a claim off an account. A dealer who loses the
mailbox needs an operator to clear `claimed_by` by hand.

## What a dealer may know

`npm run dealers -- stats` shows counts only: how many people saved a watch and how
many asked about it. It never shows who. Buyers' swipes stay private to them, and
the function refuses to run for anyone but the person who added the dealer.

## Managing dealers

Copy `scripts/.env.operator.example` to `scripts/.env.operator.local` and add the
project keys. Keep it under `scripts/` — Expo's bundler watches every `.env*` file
in the project root and will try to parse this one as JavaScript. The ignored file
gives operator scripts access without putting the service-role key in the client
bundle.

Whatever project you put in that file is the one every `dealers`, `import` and
`sweep` command writes to. It is hosted today. Re-read the warning at the top of
this document before running `add` or `remove`.

Nothing a dealer owns reaches another user's deck until you approve them.

`add` reads a contact address off the dealer's site — a `mailto:` link, the contact
page, sometimes the terms page. A dealer without one shows a warning in `list`, and
inquiries for their watches fail with "we have no address for this dealer yet".
Fix it with `set --email`.

`remove` deletes the photo files too. Foreign keys cascade the rows; storage has no
idea the listing is gone, so the CLI clears it.

## Shipping a binary

`npm run ios` still opens Expo Go. That is a host app Expo publishes, not Graham.
A store listing needs our own signed `.ipa` / `.aab`. **EAS Build** is Expo's cloud
that compiles the native project on their machines so you do not install Xcode's
full iOS toolchain locally.

The Expo project is [@guodini/graham](https://expo.dev/accounts/guodini/projects/graham).
`eas.json` names four profiles:

| Profile | What you get |
| --- | --- |
| `development` | Debug app with `expo-dev-client` on a physical phone. Needed for Sign in with Apple, which Expo Go cannot load. |
| `development-simulator` | Same, for the iOS Simulator. `simulator: true` cannot be installed on a device. |
| `preview` | Production-like, sideloaded. Android `.apk`. iOS still needs an Apple Developer account (ad hoc devices). |
| `production` | Store / TestFlight. `autoIncrement` bumps the build number on Expo's servers. |

Pin `EXPO_PUBLIC_DEMO` off for every profile. A store binary with it on is the
fixture app, not Graham.

### Environment variables on the builder

Metro inlines `EXPO_PUBLIC_*` at bundle time. EAS does not see your local `.env`
or `.env.local`. Set the hosted anon pair on the project (plaintext is fine —
these already ship inside the app):

```
eas env:create --name EXPO_PUBLIC_SUPABASE_URL --environment production --visibility plaintext
eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --environment production --visibility plaintext
```

Repeat for `preview` and `development` if those builds should hit hosted
Supabase rather than `127.0.0.1`. Never put the service-role key here.

A build is the one configuration you cannot check by looking at a file on your
machine, so confirm it with `eas env:list --environment production` rather than
assuming it matches `.env`.

### First build

Android can sign with a keystore EAS generates. iOS production and device
installs need the Apple Developer Program ($99/year) and will prompt for that
login the first time.

```
eas build --profile preview --platform android
eas build --profile production --platform ios
```

Submit only after a production build succeeds:

```
eas submit --profile production --platform ios
eas submit --profile production --platform android
```

Android submit uses the `internal` Play track until you change it. iOS submit
opens TestFlight; App Store review is a later click in App Store Connect.

After a development build is on a phone, `npm run start:dev` talks to that app
instead of Expo Go.

Do not ship a build against hosted until the migration gap at the top of this
document is closed. The binary would be Graham with no email and no dealer
applications.

## Known limits

Only email codes are enabled. Apple and Google are written but switched off until
they have credentials, so neither button appears. See the README for what turning
them on takes.

Apple additionally cannot run in Expo Go — it needs native code Expo Go cannot load,
which means a development build.

There are no automated tests above the database. `test:rls` covers every policy,
and the flows in [Testing](#testing) are walked by hand.

Demo mode reimplements the buyer surfaces in JavaScript rather than running the
real queries, so it can drift from the backend without anything failing. It is for
looking at the UI, never for confirming behaviour.
