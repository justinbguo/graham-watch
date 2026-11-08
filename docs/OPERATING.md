# Operating Graham

Everything behind the app that is neither the product nor the code: test
accounts, keys, backends, importing shops, the operator UI, and day-to-day
commands. First-time setup lives in the [README](../README.md). What the app
is for lives in [PRODUCT_SPEC](PRODUCT_SPEC.md), and how it looks in
[DESIGN](DESIGN.md). Shipping a change onto `main` lives in
[DEVELOPING](DEVELOPING.md).

## Which Graham am I looking at?

Ask this before debugging anything. There are four configurations, they look
almost identical on screen, and three of them have different data.

| Configuration | App talks to | Data you see | Started by |
| --- | --- | --- | --- |
| **Demo** | nothing | 6 watches hardcoded in `src/lib/demo.ts` | `npm run demo:web` |
| **Local** | `127.0.0.1:54321` | one seeded shop and 52 watches, plus whatever you import | `npm run env -- local`, then `npm run web` / `ios` |
| **Hosted** | `hbxgxtbtefpyutyqafoi.supabase.co` | real dealers and real watches | `npm run env -- hosted`, then the same commands |
| **EAS build** | whatever `eas env` says | depends | `eas build` |

One switch moves the app, the operator scripts, and the operator UI together:

```
npm run env              # where each of the three points right now
npm run env -- local     # all three → the running local stack
npm run env -- hosted    # all three → production
```

Metro and the operator UI read env when they start, so restart them after a
switch. `npm run check:env` prints `app → local` or `app → hosted · <host>` on
every start as well.

The switch is file presence. `.env` holds the hosted pair for the app and
`scripts/.env.operator.local` holds the hosted trio for the scripts; neither is
written by the switch. `npm run env -- local` writes `.env.local` from
`supabase status`, which Expo loads at higher precedence, and `hosted` deletes
it. The scripts read the same file's presence. `operator/.env.local` is rewritten
either way.

Two commands ignore the switch on purpose. `npm run test:rls` always runs local,
because it creates and deletes users. `npm run snapshot` always reads hosted,
because the seed is a copy of real inventory. To cross over for one command,
`GRAHAM_TARGET=local` or `GRAHAM_TARGET=hosted` in front of it wins over the
file, and an exported `SUPABASE_URL` wins over both.

## Hosted is behind local

Hosted is not a mirror of your machine and nothing keeps it in step. Edge
functions deploy from `main` when their code changes. Schema changes still
need `npm run db:push` after a dump. Check before blaming the code:

```
npx supabase migration list      # local vs remote, side by side
npx supabase functions list      # what is actually deployed
npx supabase secrets list        # names only, values are hashed
```

What is still missing on hosted, and what it looks like if you test there:

| Not on hosted | Symptom if you try it there |
| --- | --- |
| Migration `20261012000001_exchange_random` | Posting a Random post fails with `invalid input value for enum exchange_intent: "random"` |
| `RESEND_API_KEY` / `SMTP_HOST` | **No mail sends at all** — claim codes, application codes, inquiries |
| `SCRAPE_PROVIDER` / `JINA_API_KEY` | Imports fall back to plain `fetch`, so JavaScript-rendered shops read as empty |

That first row means hosted Graham still cannot email anyone. Treat it as a
deploy that has not happened, not a bug to hunt:

```
supabase secrets set RESEND_API_KEY=... SCRAPE_PROVIDER=jina JINA_API_KEY=...
```

Functions go up from GitHub when a change to `supabase/functions/` or
`supabase/config.toml` is pushed to `main`
(`.github/workflows/deploy-functions.yml`). That is the deploy that was
missing when `import-listings` on hosted stayed on an old copy. The workflow
deploys only the functions whose code changed. Shared code or a config
change deploys all of them. `import-listings` keeps `verify_jwt = true` in
`supabase/config.toml`; the workflow refuses to run if that is turned off,
and it never passes `--no-verify-jwt`.

One new repository secret, and nothing else:

| Secret | What it is |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | A personal access token from [Account → Access Tokens](https://supabase.com/dashboard/account/tokens). The CLI reads it from the environment. The project ref `hbxgxtbtefpyutyqafoi` is in the workflow, not a secret. An expired token fails the job immediately with `401 Invalid access token` and names this secret. Functions stay on the last deploy until it is replaced, then re-run the workflow. |

The nightly refresh secrets are unchanged and still required on the repo:
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`GRAHAM_CRON_SECRET`.

Migrations do not ride along. `supabase db push` writes the production
schema, including every migration hosted has not seen yet, and it needs the
database password. Apply them on purpose, and take a dump first if the data
matters:

```
npx supabase db dump --linked --data-only -f ~/graham-backups/data-$(date +%F).sql
npm run db:push:dry
npm run db:push
```

`refresh_runs`, pause, and the photo counts in the operator console all wait
on that push. The refresh script keeps working before it: a missing table is
a note in the job log, not a failed night. Function deploys do not wait on
the migration. After the token above is set, the next push to `main` that
touches a function ships it. Re-run the failed Deploy workflow from the
Actions tab if the token was added after that push.

Run those as separate lines. A `#` comment on the same line as `npm run db:push`
is not a comment to npm — everything after `--` is forwarded to the Supabase CLI,
which then errors with `Unexpected positional arguments: "#", "list"`. Use
`npm run db:push:dry` instead of `npm run db:push -- --dry-run`.

An operator on hosted is a row in `operators` there, and `npm run db:reset`
cannot reach it. Grant one with `npm run dealers -- operator you@example.com`
while the scripts point at hosted, which is their default.

## Three processes

Almost every confusing failure is one of these being down. Ask "which of the three?"
before anything else.

1. **Colima** — the Linux VM that runs containers. The database lives inside it.
   Docker Desktop is not installed and is not a fallback.
2. **Supabase** — ten containers: Postgres, auth, the REST API, Studio, the mail catcher.
3. **Metro** — Expo's bundler. Compiles TypeScript into one JavaScript file and serves
   it to the simulator or browser. It prints `Bundled 3458ms`.

## Starting cold

Colima does not start itself after a reboot. When the database seems to have vanished
and `npm run db:start` fails because nothing is listening for containers, this is why.

```
colima start
npm run db:start
npm run ios        # or npm run web
```

The `docker` command remembers which socket to use. A leftover Docker Desktop
install leaves that set to `desktop-linux`, which looks for
`~/.docker/run/docker.sock` and fails with `no such file or directory` even
while Colima is running. Colima's socket is `~/.colima/default/docker.sock`.
Once, run `docker context use colima`. That choice survives reboots.
`colima start` does not change it.

Shutting down is the reverse. `colima stop` returns about 8GB of RAM. To rebuild
the stack after changing `supabase/functions/.env`, use `npm run db:stop &&
npm run db:start`. Do not reach for a container CLI.

## Running the app

| Command | Opens |
| --- | --- |
| `npm run web` | Browser. Fastest loop. |
| `npm run ios` | iOS Simulator via Expo Go |
| `npm run start:dev` | A development build already installed on a device |
| `npm run demo:web` | Fixtures only, no backend needed |
| `npm run build:preview:android` | Cloud APK with demo fixtures — install on a phone |

Phone installs (no laptop left running): [PHONE.md](PHONE.md).

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
| `profiles.account_type` | Always `buyer` from onboarding. **Routing only — proves nothing.** | Onboarding, not a question |
| `dealers.claimed_by` | This account controls this shop: reads hidden listings, edits them, sees inquiries, refreshes the catalogue | Proving a mailbox on the shop's domain |
| `dealers.permission` | Whether this shop's watches reach buyers' decks | An operator, from the CLI only |

`account_type` grants nothing on purpose. Onboarding no longer asks, and writes
`buyer`. Every dealer power comes from `claimed_by`.

`permission` is unreachable from the app by RLS, so a shop can never publish its
own inventory. That is why importing a shop does not make it visible.

Finishing onboarding also requires `profiles.date_of_birth` of 18 or over and
a `profiles.handle`. The birthday is an age gate, not a permission. The handle
is the username from slide 2: lowercase, unique, 3–20 characters, starting
with a letter. `claim_username` reserves it there. A trigger refuses
`onboarded_at` without either.

The final onboarding question calls `expo-notifications` for the OS permission.
On Android it creates the `watch-updates` channel before the request; without a
channel Android 13 does not show its prompt. The result is stored in
`profiles.notifications_enabled`. That column records the permission answer.
A granted device stores its token in `device_push_tokens`. `notify-drops`
sends one Expo push when a followed shop lists a watch the buyer has not
opened. A new message still has no push and no email. Remote push on Android
needs a development build. Expo Go cannot receive it there.

When `EXPO_PUBLIC_REVENUECAT_*` keys are set on iOS or Android, the Graham Pro
paywall screen runs next. `onboarded_at` is written after subscribe, restore, or
Not now. See [REVENUECAT](REVENUECAT.md).

### The buyer path

Deck of one watch at a time (`(tabs)/index`) → swipe right saves, left passes →
Wishlist tab → **Message** under the price. That opens the thread with the shop
about that watch. A shop that has not claimed its account shows **Email the
shop** instead of a composer, and that email is the inquiry. Writing is a
separate deliberate act, never a side effect of saving.

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

Once a shop is claimed, the **Deal** tab replaces Messages. The screen is
Seller Hub in the code. Its sections are Messages, Payments, Analytics,
Listings, and Support. Profile stays the workspace for catalogue refresh and
the claim flow.

### The operator path

Not in the phone app, and never reachable by a dealer: RLS blocks approving a
shop you created, so publishing is somebody else's decision by construction.

Three surfaces do it. This script, holding the service-role key. The web UI
below, holding the anon key and an `operators` row. And `operator-bot`, which
checks `GRAHAM_OPERATOR_SECRET` and then calls `bot_set_dealer_permission`.
The script and the console end up in the same functions. See
[Why an operator is a row](#why-an-operator-is-a-row).

### Headless operator

A bot on another machine can run the operator calls with one stored value, the project's secret key (`sb_secret_...`). That key is not a JWT. `import-listings` still requires a signed-in session, and the gateway rejects a non-JWT there. The bot calls `operator-bot` instead.

Set the function secret to that same key, then deploy `operator-bot` by pushing the function (the Deploy edge functions workflow). Apply migration `20261107195155_operator_bot.sql` on purpose. This guide does not apply it. `20261107200827_bot_publish_unowned_shop.sql` lets that import publish a shop that has no owner. The hosted database already has that version. Do not apply it again. `20261107223000_gallery_completes_publish.sql` is not on the hosted database. It stops `apply_source_item` from stamping `applied_hash` before the gallery is stored, puts a photo-less or thin gallery back on the publish queue, and hides an approved shop's listing from buyers until it has three photographs. Apply that one on purpose, after a backup and a dry run. This guide does not apply it.

```
supabase secrets set GRAHAM_OPERATOR_SECRET="$GRAHAM_OPERATOR_SECRET"
```

`$GRAHAM_OPERATOR_SECRET` is the secret key. `$SUPABASE_URL` is the project URL, such as `https://<project-ref>.supabase.co`. Send the secret as both headers. The gateway accepts it as the API key. The function compares the bearer token to `GRAHAM_OPERATOR_SECRET`. Anon keys, user access tokens, and a wrong value get `401` and write nothing.

```
curl -sS "$SUPABASE_URL/functions/v1/operator-bot" \
  -H "apikey: $GRAHAM_OPERATOR_SECRET" \
  -H "Authorization: Bearer $GRAHAM_OPERATOR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"action":"discover","domain":"example.com"}'

curl -sS "$SUPABASE_URL/functions/v1/operator-bot" \
  -H "apikey: $GRAHAM_OPERATOR_SECRET" \
  -H "Authorization: Bearer $GRAHAM_OPERATOR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"action":"inspect","sourceUrl":"https://example.com/collections/watches"}'

curl -sS "$SUPABASE_URL/functions/v1/operator-bot" \
  -H "apikey: $GRAHAM_OPERATOR_SECRET" \
  -H "Authorization: Bearer $GRAHAM_OPERATOR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"action":"import","sourceUrl":"https://example.com/collections/watches","dealerName":"Example"}'

curl -sS "$SUPABASE_URL/functions/v1/operator-bot" \
  -H "apikey: $GRAHAM_OPERATOR_SECRET" \
  -H "Authorization: Bearer $GRAHAM_OPERATOR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"action":"approve","dealerId":"00000000-0000-4000-8000-000000000000"}'

curl -sS "$SUPABASE_URL/functions/v1/operator-bot" \
  -H "apikey: $GRAHAM_OPERATOR_SECRET" \
  -H "Authorization: Bearer $GRAHAM_OPERATOR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"action":"unapprove","dealerId":"00000000-0000-4000-8000-000000000000"}'

curl -sS "$SUPABASE_URL/functions/v1/operator-bot" \
  -H "apikey: $GRAHAM_OPERATOR_SECRET" \
  -H "Authorization: Bearer $GRAHAM_OPERATOR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"action":"report","dealerId":"00000000-0000-4000-8000-000000000000"}'

curl -sS "$SUPABASE_URL/functions/v1/operator-bot" \
  -H "apikey: $GRAHAM_OPERATOR_SECRET" \
  -H "Authorization: Bearer $GRAHAM_OPERATOR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"action":"enrich-icons","dealerId":"00000000-0000-4000-8000-000000000000"}'
```

`enrich-icons` reads shop homepages and plans `dealers.logo_url` changes. It does not import listings. Omitting `dryRun`, or setting it to true, writes nothing. `dryRun: false` writes. A script does the same job and also refuses a non-local write:

```
deno run --config supabase/functions/deno.ci.json --allow-net --allow-read --allow-env scripts/enrich-dealer-icons.ts
node scripts/repair-placeholder-photos.mjs
```

The repair script lists `listing_photos` rows whose bytes are the Squarespace no-image file, and the gallery row it would move to position 0. It does not delete storage objects. `--write` on either script refuses any host other than loopback. Do not point either script at production without a separate approval.

`import` creates the shop as `pending` when the website is new. It does not approve the shop. The first call reads the catalogue into `source_items` and marks the for-sale rows for publish. It does not copy photographs in that same call. A later call, while a succeeded import for that same URL is less than six hours old, skips the site and publishes one batch of two watches. Repeat `import` with the same body until `publish.pending` is `0`. The same call twice is safe. A watch is applied only after its gallery is stored, so a call that dies mid-gallery leaves that watch in `publish.pending` and the next call finishes the photographs. `publish.failed` counts watches that recorded an error. Those wait for a catalogue read, which clears the error. `approve` sets `dealers.permission` to `approved`, which is what puts watches with at least three photographs on the Buy deck. A listing with fewer than three photographs stays hidden from buyers. `unapprove` sets the shop back to `pending`. A `revoked` shop stays revoked. `report` returns the permission, active and total listing counts, and the latest `import_jobs` row.

Each successful discover, inspect, import, and report writes `operator_actions` with `actor` `operator-bot`. Approve and unapprove write that actor inside `bot_set_dealer_permission`. The operator console shows the actor as "operator bot".

A local stack can import fixture listings without scraping. The hosted function returns 404 for that shape and writes nothing. The edge runtime needs `GRAHAM_ALLOW_FIXTURE_IMPORT=1` and a local `SUPABASE_URL`. The same call twice does not insert the same `source_url` again, and it does not move an already approved shop back to pending.

```
curl -sS "$SUPABASE_URL/functions/v1/operator-bot" \
  -H "apikey: $GRAHAM_OPERATOR_SECRET" \
  -H "Authorization: Bearer $GRAHAM_OPERATOR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"action":"import","sourceUrl":"https://bot-proof.graham.test","dealerName":"Bot Proof","listings":[{"brand":"Bot Proof","model":"Secret Door","reference":"BOT-1","year":1968,"price_cents":100000,"description":"A short proof watch.","source_url":"https://bot-proof.graham.test/watches/secret-door","photo_url":"https://images.squarespace-cdn.com/content/v1/64d53a504f5aee6d2b32ee14/19e5672c-8f2f-4bc3-ac40-a2c141dc78c7/B0004038.jpg?format=1500w"}]}'
```

The function compares the bearer token. When Authorization is absent it compares the apikey header. The curls send the secret as both, so a gateway that checks the API key and the function that checks the bearer see the same value. A wrong bearer is rejected even when the apikey header is the secret.

```
npm run dealers                          # who is in, and whether we can email them
npm run dealers -- add <domain>          # discover, preview, import, approve
npm run dealers -- set <id|host>         # re-read their name and address from their site
npm run dealers -- stats <id|host>       # saves and inquiries per watch
npm run dealers -- remove <id|host>      # delete them, their listings and their photos
npm run dealers -- approve <id|host>     # publish their listings
npm run dealers -- pause <id|host>       # hide a published shop, skip its refresh
npm run dealers -- resume <id|host>      # publish a paused shop again
npm run dealers -- revoke <id|host>      # pull them back

npm run dealers -- applications          # shops asking to be listed
npm run dealers -- accept <app-id>       # turn one into a shop they own
npm run dealers -- decline <app-id>      # say no, with --note

npm run dealers -- operator [email]      # let an account approve shops
```

`accept` and `approve` are different gates. Accepting hands a shop to the dealer
who applied for it; approving is what puts its listings in a deck. `accept
--hold` does the first without the second.

In `applications`, `●` means the mailbox is proved and `○` means it is not. An
unproved application cannot be accepted — the function refuses — so `○` is
waiting on the applicant, not on you. `decline` requires `--note`, because the
applicant reads it on their own profile and a decline with no reason is the dead
end the application flow exists to remove.

## The operator UI

Reviewing applications in a terminal means reading a shop's website out of one
window and typing a uuid into another. `operator/` is a small web app for the
same two jobs: answer applications, and publish or pull back a shop.

```
npm run env -- local           # writes operator/.env.local from `supabase status`
cd operator
npm install
npm run dev                    # http://localhost:5173
```

Sign in with an email and password. Both are set from the terminal:

```
npm run dealers -- operator you@example.com --password "..."
```

That creates the account if the address has none, sets the password if it does,
and grants operator either way. There is no sign-up and no password reset in the
UI, so this command is the only way in — which is the point. Run it again to
change the password.

Minimum twelve characters, enforced by the script. Supabase's own floor is six,
and this account decides which shops are live against an auth endpoint that is
open to the internet.

The phone app still uses one-time codes, because a buyer should never have a
password to forget. An operator is one person with a terminal, and on hosted a
code round trip goes through Supabase's built-in mailer, which allows only a few
an hour. A password can be guessed where a code cannot; the length floor is the
answer to that, not an afterthought.

Run it with no argument to grant `operator@graham.local`, which is what every
other command in that script already signs in as. Locally that account's
password is `graham-operator`.

A `db:reset` drops the account, the password and the grant together. Run it
again.

### Seeding the deck

Filling the app with watches is three steps, kept apart because only the
second costs money and only the third reaches a buyer.

1. **Add shops.** Paste domains or upload a CSV ([Adding shops in bulk](#adding-shops-in-bulk)).
   Each shop is created unpublished with its catalogue read. Costs HTTP on
   Shopify and Squarespace.
2. **Import** on a shop's row. Turns catalogue items into watches: a model call
   and a photo download each, so you type the count.
3. **Publish** the shop. This puts its watches in the deck.

**Listed** on the preview table counts product URLs in the shop's sitemap,
sold stock included. A vintage dealer's sitemap is mostly watches sold years
ago, so 970 listed against 79 for sale is normal. **Inspect** on a row reads
the whole feed and shows every product: brand, type, price, SKU, photo count,
publish date, and whether it is for sale, sold, or refused with the reason. It
writes nothing.

The arrow on a shop's row opens what has been imported, with photos, prices,
and the catalogue items that failed to read.

### Keeping shops current

```
npm run refresh                 # every approved shop: sync + auto-publish
npm run refresh -- <dealer-id>  # one shop
```

Needs `GRAHAM_CRON_SECRET` in `scripts/.env.operator.local` (and the same value
on the hosted `import-listings` function) plus the ordinary service-role trio.
GitHub Actions runs the same command nightly at 06:00 UTC
(`.github/workflows/refresh.yml`); set the four secrets on the repo.

A paused shop is not in that list. Pause is a permission (`paused`), same as
revoked not being `approved`, so the nightly query never calls the function
for it. Resume publishes it again. Revoke is the other door: the console
shows a different word, and only a shop that is published right now can be
paused.

The job prints a shop health summary after the per-shop lines and writes one
row per shop to `refresh_runs` when that table exists. A single shop's error,
an empty catalogue, live watches with no photographs, or seven nights with
nothing new, changed, or published is a warning on the Actions run. The job
stays green unless every shop failed, the request itself was rejected, or
`notify-drops` failed. After the shops are written it calls `notify-drops`
and prints how many people were sent a push and why anyone was skipped
(no token, already notified today, nothing new since the follow, token on
an account that follows nobody). A night with nobody to notify stays green.
A 404, a rejected cron secret, or a delivery error fails the job. The same
`GRAHAM_CRON_SECRET` has to be a hosted edge-function secret, not only a
GitHub secret: `notify-drops` returns 503 when that value is missing.
Until the migration is on hosted, the summary says the history table is
missing and still prints today's lines.

The Dealers table shows **Last refresh**: when the nightly job last finished,
how many listings it published and skipped, the photo count, how many live
watches have no photograph, and the last error as text in the cell. Before the
first recorded run, the cell falls back to the catalogue read (how many it
found, how many were new). `incomplete` means that read stopped before the
end of the catalogue, so absence was not treated as sold.

Filter the table by status or by a flag. A shop is **neglected** when it is
unclaimed, when the person who claimed it has not signed in for 14 days, or
when a buyer’s inquiry or message has waited 48 hours with no reply from that
person. Sort by name, status, how many watches are imported, missing photos,
last error, or how many of those flags are set.

The arrow on a shop opens its watches. **Hide** takes one out of the deck and
leaves it there across a refresh. **Edit** changes brand, model, reference,
year, size, price, condition, and description; those fields are recorded the
same way a dealer’s own corrections are, so the nightly refresh does not put
the shop’s old values back. **Sold** marks it sold with dealer provenance,
which the feed will not clear. **Available** puts it back on sale, and the
next refresh may sell it again if the site says so. **Delete** is still there
and asks you to type DELETE. Prefer Hide.

**Claim code** on an unclaimed shop issues a six-digit code, shows it once so
you can copy it, and lets you revoke it. It lasts seven days and any signed-in
account can enter it on Profile → Claim your shop. **Unassign** clears whoever
claimed the shop and burns a live code. Mailbox codes, the ones the app emails,
are unchanged: fifteen minutes, and only the account that asked can spend them.

**Users** is the dashboard: signups, who is active, onboarding answers, saves,
the path from inquiries to deals, and how fast each shop replies. **Activity**
is the log of operator writes. Neither screen is readable by a buyer.

### Which Graham the UI is talking to

`operator/.env.local` decides, and `npm run env` writes it alongside the app
and the scripts, so the three agree unless the file was edited by hand. A grant
is per project, so being an operator locally is not being an operator on
hosted.

A mismatch has one confusing symptom: the grant command reports that the
address can approve shops, and the UI still says it is not an operator. Two
different databases, both telling the truth. `npm run env` shows which is which.

Aiming the UI at hosted is `npm run env -- hosted`. Everything it does there is a write to production:
accepting an application hands a real shop to a real dealer, and publishing puts
real stock in real decks.

### Why an operator is a row

Everything in `scripts/` authorises by holding `SUPABASE_SERVICE_ROLE_KEY`. That
key bypasses row-level security on every table in the project — every buyer's
saved list, delete rights on every listing — which is fine for a script on one
laptop and unacceptable in a browser. So the UI holds the anon key and signs in
normally, and the functions it calls check the caller against the `operators`
table instead.

The practical differences:

- Access is revocable per person. Delete the row; no key rotation.
- `dealer_applications.reviewed_by` now records who answered.
- A grant can be given to a real address, so there is no shared password.

`set_dealer_permission` is the only implementation of "publish a shop", used by
both the UI and `dealers -- approve`. The same is true of accept and decline.

### The three numbers on Dealers

**In the deck** is what a buyer can see right now, and it is the shop-level half
of `search_listings`' own test: the watch is active, unsold, *and the shop is
approved*. A shop that is pending or revoked reads zero however much it holds.

**Imported** is every listing row we have for them.

**Catalogue** is what their site is offering — `source_items`, which a catalogue
read fills and `Import` draws from. A shop can hold five hundred here and no
listings at all; that is the normal state right after it is added.

A gap between the first two is sold or deactivated stock — or the whole shop not
being approved, which is what `Publish` changes. The deck also hides from you
the watches you imported yourself, and anything you have already swiped, so
that count cannot be read off one shop. Search does not hide your imports:
that is where you check a shop you just published is findable. Adding a shop
still only reads its catalogue. The watches reach Search once they are imported
and the shop is approved.

Under Catalogue, `N queued` is an import that stopped part way. The rows stay
marked, so importing again drains exactly those. `N failed` are catalogue items
the model could not read; they are not retried on every batch, because one bad
row at the head of the queue would stall everything behind it. Expand the shop to
read why each failed.

Applications lists only what is waiting. An accepted one is a shop and lives on
Dealers; a declined one is not a record worth a tab, since the applicant reads
the note on their profile and reapplying files a new row.

### Adding shops in bulk

Paste domains one per line, or upload a CSV. A first row naming its columns is
read as a header — `domain`, `website`, `url` and `site` all name the domain
column; `name`/`shop`/`dealer` and `email`/`contact` fill the rest. A first row
that holds a domain is treated as data, because eating it would silently drop a
shop. Quoted fields are honoured, so `"Watches, Ltd"` stays one field. Lines with
no domain in them are reported with their line number rather than skipped.

The run is two phases. Reading the sites writes nothing, so every shop is read
first and listed with what discovery found — platform, product count, contact
address — and rows can be unticked before anything is created. Then each shop is
created at `pending` with its catalogue read, one at a time.

Three things make an interrupted run safe to repeat:

- `dealers.website` is unique and the importer keys on it, so the same list
  pasted twice adds nothing twice. A race on one domain ends with one row.
- Adding a shop never publishes it. New shops are `pending`, which the deck
  excludes, so an unreviewed catalogue cannot reach a buyer.
- A stopped import leaves its queue marked. `Import` drains what is left first.

The hour's ceiling is 200 new shops for an operator and 10 for anyone else, and
the refusal is a 429 that names the wait. Shops already added are unaffected:
refreshing and importing them are not metered.

### What a refresh reads about the shop itself

Besides the catalogue, a refresh takes three things off the shop's homepage and
writes them to the dealer row: a description, an Instagram handle, and the icon
the page declares. They are what a buyer sees on the dealer's page beside the
name. Expand a shop to check what was found.

All three come out of HTML the importer already downloads to read the shop's
name, so they cost nothing beyond one request confirming the icon is really an
image — Analog Shift declare one that 404s, and Squarespace answers that 404
with a web page rather than an error, which stored unchecked is a permanently
broken image next to a dealer's name.

Coverage across eight real dealer sites: descriptions on 7, handles on 7, icons
on 6. A phone number was there on 1 and a postal address on 0, which is why
neither is collected — a field blank seven times in eight is a blank space on a
page. Location was findable on 5 by reading contact pages as prose, and was left
out because a pattern match eventually reads "we ship from Hong Kong" as an
address, and a wrong city on a dealer's page is worse than no city.

A refresh overwrites all three rather than filling blanks, unlike the contact
address directly above. They are read off the page rather than typed by anyone,
and a logo URL points into the shop's CDN, which does not survive a redesign —
so refusing to overwrite would stop Refresh repairing the thing it is for.
Nothing found leaves the old value alone, so a site that is briefly down does
not blank a dealer's page. When dealers can edit their own, this needs the
`edited_fields` treatment listings already carry.

### Who may run the importer

`controls_dealer` is the one answer, and operator status is part of it only while
a shop is unclaimed. A claim is a dealer taking over their own inventory, so a
claimed shop shows `Import` disabled — see the ownership rules above for why
widening that would undo them. `operator_dealers.can_import` is the same
function the write itself consults, so the button cannot disagree with the
policy.

"One answer" took three migrations to become true. `sync_source_availability`
and `adopt_existing_listings` kept a copy of the triple `controls_dealer`
replaced until `20260920000101`, and both run inside every catalogue read — so
an operator refreshing a shop added from the terminal tools watched the rows
land and then read `You do not manage that shop.` from an RPC two statements
later. The symptom of this class of bug is always that shape: a write that
half happens.

`public.dealer_stats` is the last copy of that triple and keeps it on purpose.
A claim moves the shop — its contact address, its listings, its catalogue — but
not its save and inquiry counts, which whoever imported it goes on reading. It
is the one place `controls_dealer` is deliberately not the answer, so a change
there is a product decision rather than a cleanup.

The dealers table reads through `operator_dealers()` rather than the table,
because `select` on `public.dealers` is granted column by column and
`contact_email` is left out on purpose — see `20260912000007`. Granting that
column back to `authenticated` to save a function would hand every dealer's
mailbox to every buyer.

## Testing

### The automated checks

| Command | Catches | Blind to |
| --- | --- | --- |
| `npm run typecheck` | Type errors in the app | Anything at runtime |
| `npx expo export --platform web` | Broken route tree, missing assets, bad imports | Logic |
| `npm run build` in `operator/` | Type errors and a broken bundle in the operator UI | Logic |
| `npx oxlint --deny-warnings` in `operator/` | Lint in the operator UI | The Expo app, which has no linter |
| `deno check --config supabase/functions/deno.ci.json …` | Type errors in the seven edge functions | Logic, and whether they are deployed |
| `deno test --config supabase/functions/deno.ci.json supabase/functions/` | The Squarespace, Shopify, and sitemap parsers, against payloads a real shop returned | Extraction, photos, and the write path |
| `npm run test:rls` | Every security policy, over HTTP, from a buyer's side of the wire | Anything above the database |
| `npm run test:filters` | v2 search, v2 counts, v1, and `matchesListing` return the same watches, and keyset pages do not skip or repeat | Anything above the database |

Run `npm run typecheck` and `npm run test:rls` before every commit; both are
seconds. CI runs all of them on every push and pull request:

| Job | Checks |
| --- | --- |
| `app` | `npm run typecheck`, a web bundle, and the refresh and deploy planner tests |
| `operator ui` | `npm run build`, `oxlint --deny-warnings`, and `npm test`, in `operator/` |
| `edge functions` | `deno check` on all seven, then `deno test` over the directory |
| `database` | every migration from empty, `npm run test:rls`, `npm run test:filters`, generated types |
| `drops verification` | `npm run verify:drops` against one local stack |

Deploying the functions is a different workflow, `Deploy edge functions`, and
it runs only on a push to `main` that touches function code or
`supabase/config.toml`. A pull request does not deploy anything.

The operator job installs from `operator/package-lock.json` and never runs the
root `npm ci`. Vite and Expo both want to own React and the bundler, so the two
do not share a dependency tree; the schema types the UI imports are a committed
file rather than a dependency.

It also passes placeholder `VITE_` values, which is load-bearing in a way worth
knowing before you copy the job. `operator/src/supabase.ts` throws when the env
is missing, so with nothing set Rollup proves the throw always runs, treats
`createClient` as unreachable, and tree-shakes supabase-js out entirely. The
build stays green while bundling an app that can only crash — 228kB instead of
444kB.

The bundle is there because `tsc` reads files and does not resolve the route tree.
A screen deleted while a navigator still registers it type-checks and then fails
on launch.

The edge functions are not part of the Expo program, so `npm run typecheck` has
never seen them. `deno check` is the only type check the import pipeline gets. It
runs with `--config supabase/functions/deno.ci.json`, which exists solely to stop
Deno walking up to the app's `package.json`; without it, checking six server
files resolves the whole Expo tree and any package published in the last day
fails Deno's dependency-age policy.

The types job regenerates `database.types.ts` and fails if it differs from the
committed file. A migration merged without `npm run db:types` means TypeScript is
lying about your columns, and nothing else notices.

So the generated file is never edited by hand. Where Postgres allows more than
the generator can read — a null inside a price band, a null function argument, a
column a trigger fills — the correction goes in `src/lib/database.ts`, which
wraps the generated type. App code imports `Database` from there.

The Supabase CLI version is pinned exactly in `package.json`, and CI pins the same
number in `.github/workflows/ci.yml`. Bump both together.

The pin is not cosmetic. 2.100.1 and 2.117.0 generate `database.types.ts` with
different punctuation in the generic helpers, so a file written by one version
fails the diff under the other — a red build that has nothing to do with the
schema.

`npm run` puts `node_modules/.bin` at the front of `PATH`, so every `db:*` script
uses the pinned binary no matter what `supabase` means in your shell. A bare
`supabase db reset` in a terminal does not: that is whatever Homebrew installed.
Homebrew 2.100 rejects `[local_smtp]` in `supabase/config.toml` with
`invalid keys: local_smtp`; use `npm run db:push`, not `supabase db push`.
Check with `npm exec -- supabase --version` against `supabase --version`; if they
disagree, run schema commands through `npm run`.
Do not paste shell comments on the same line as `npm run db:*` when you pass flags
after `--` — npm forwards the `#` and the words after it to the Supabase CLI,
which prints help instead of running. Same failure mode as `npm run db:start`
with a trailing comment.

None of them proves the app works. The one test above the database covers a feed
parser; there is nothing exercising the buyer or dealer flows, so those are
walked by hand.

### What to run after what you changed

| After you change | Run |
| --- | --- |
| The schema | `npm run db:types`, then `npm run test:rls` |
| A security policy | `npm run test:rls` |
| An edge function | `deno check` and `deno test`, then `supabase functions serve <name>` |
| A shop's feed parser | `deno test` — the fixtures are real payloads |
| The operator UI | `npm run build` and `npx oxlint` inside `operator/` |
| Which backend the app uses | `npm run check:env`, which also prints it on every start |

`npm run db:reset` is the undo button: drops everything, re-runs every migration
in order, and re-seeds the inventory snapshot so the deck works again. Nothing
local is precious, which is the point — a reset costs half a minute and no
network. Migrations are append-only once they have run: never edit one, add a
new file.

The snapshot in `supabase/seed.sql` is generated. Regenerate it with
`npm run snapshot` when the shape of the data changes, and never edit it by
hand.

Two interfaces worth bookmarking:

- **Studio** http://127.0.0.1:54323 — browse and edit rows
- **Mailpit** http://127.0.0.1:54324 — every email the app sends

### Walking the buyer flow

`npm run db:reset` leaves one shop and 52 watches in the deck already — the
snapshot in `supabase/seed.sql`. Nothing to import first:

1. `npm run web`, sign in with any address, or as one of the [test accounts](#test-accounts).
2. Onboarding asks for a name — the inquiry email opens with it, so it is not optional.
3. Swipe the deck. Right saves, left passes.
4. Wishlist tab → **Message** under the price. The seed shop has not claimed, so
   the thread offers **Email the shop**. That is the inquiry.
5. Read the mail in Mailpit. Check the Reply-To is your buyer address, not Graham's.

To walk it against a shop of your own instead, add one to the local stack —
`dealers:local` targets whatever `supabase start` is running whichever way the
repo is switched, so it cannot import into production:

```
npm run dealers:local -- add goldfingersvintage.com --limit 10 --yes
```

`add` discovers, previews, imports and approves in one pass, and takes about 15
seconds on a Squarespace shop — the adapter reads their JSON feed directly
rather than paying for a scrape and an extraction. Expect most of the catalogue
to be held back as sold.

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

1. Sign in as a new address and finish onboarding. Profile offers **Claim your shop**.
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
2. On the simulator, web, or a phone on the same Wi-Fi, wait: the app reads
   the code from Mailpit and signs you in. The phone uses the Mac's LAN
   address, because `127.0.0.1` on the phone is the phone.
3. If the code does not fill in, open http://127.0.0.1:54324 on the Mac and
   type the six digits. Checking a real inbox will not show it.

The account is created on first use. Codes expire after an hour.

That Mailpit-reading shortcut is gated on the Supabase URL being a local host,
not on `__DEV__`. Expo Go is always "dev" even when pointed at hosted, where
there is no Mailpit to read.

### Test accounts

**Local:** `npm run db:reset` deletes fixture users; run `npm run mock:users`
again. Codes auto-fill from Mailpit.

**Hosted:** fixtures are created with the service role (`scripts/.env.operator.local`).
They do not receive email. Use `npm run mock:signin -- gold@graham.test` for a
one-time code after `npm run mock:users -- --yes --gold-only`.

| Address | Name | What it is for | Made by |
| --- | --- | --- | --- |
| `ada@graham.test` | Ada Byron, `@ada` | Buyer. Messages Bea, and Mock Desk about its watch. | `npm run mock:users` |
| `bea@graham.test` | Bea Cole, `@bea` | The second buyer, for a buyer-to-buyer thread. | `npm run mock:users` |
| `dealer@graham.test` | Dana Hart, `@desk` | Dealer. Owns Mock Desk and answers Ada in the app. | `npm run mock:users` |
| `gold@graham.test` | Max Goldfinger, `@goldfinger` | Dealer. Owns **Goldfinger's Vintage** (claim via script). | `npm run mock:users` (local) or `npm run mock:users -- --yes --gold-only` (hosted) |
| `seed-shop@graham.test` | none | Added Goldfinger's Vintage. Never sign in as it: the deck hides a shop's watches from whoever added it, so it shows an empty deck. | `npm run db:reset` |
| `operator@graham.local` | none | Operator UI sign-in, password `graham-operator`. The terminal scripts import as this account. | `npm run dealers:local -- operator` |

Sign in to the app as Ada, Bea, or Dana with **Log in with email**. The code
fills in from Mailpit, so there is no password to type. One device holds one
session, so sign out before switching. Two simulators let both sides of a
thread stay open.

Two shops exist after both commands:

| Shop | Contact | State | Walks |
| --- | --- | --- | --- |
| Goldfinger's Vintage | `gold@graham.test` | Claimed by Max (`@goldfinger`), 52 watches | Shop owner in the app |
| Mock Desk, `mock-desk.graham.test` | `dealer@graham.test` | Claimed by Dana, one watch: Fixture Message Test, `MOCK-1` | A reply in the app |

`mock:users` is safe to repeat. It finishes each profile (name, handle,
birthday, onboarded), so these accounts skip onboarding. To walk onboarding,
sign in with a new address.

Hosted Goldfinger only (no Mock Desk):

```
npm run env -- hosted
npm run mock:users -- --yes --gold-only
npm run mock:signin -- gold@graham.test
```

Use **Log in with email** in the app and paste the printed code.

`npm run test:rls` makes its own accounts, such as `buyer-<timestamp>@example.com`
and `claimer-<timestamp>@personal.test`, with password `password123`. It deletes
them when it finishes. A run that crashes partway leaves some behind. They are
harmless, and the next reset clears them.

## Which failures are expected

Working-as-designed, so do not debug these:

| What you see | Why |
| --- | --- |
| Demo mode: dealer buttons and `Send via Graham` do nothing | `src/lib/demo.ts` fakes the buyer surfaces only — deck, search, saved, profile, one listing, and a mail draft. Nothing else has a fixture. |
| Demo mode: `Open in my mail app` opens a composer to `vintagevault.test` | `demoMailDraft` composes offline against the fixture shop. The address is not real; do not send it. |
| A function returns `404 Function not found` locally, and the file is right there | The local stack reads the functions directory once, at `supabase start`, and keeps the list in an env var on the edge container. A function written since then is not served, and restarting the container does not help. `npm run db:stop && npm run db:start`. |
| An anon REST request returns zero rows | Listings are invisible unauthenticated by policy. Says nothing about whether data exists; count with the service-role key. |
| An imported shop's watches are not in any deck | `permission` is still `pending`. Needs `dealers -- approve`. |
| A watch vanishes from the deck | Sold, deactivated, or its shop was revoked. `search_listings` filters all three. |
| No email arrives in a real inbox, locally | Everything goes to Mailpit by design. |
| A dealer on `shop.com` cannot use `me@mail.shop.com` | The domain rule is the exact host with `www.` stripped, never a parent — otherwise anyone with a `squarespace.com` address could claim a Squarespace shop. |
| Apple's own button is missing in Expo Go | The native module does not load there. The door on screen is ours, and it needs a Services ID before Apple answers. |
| Google's door is missing | `EXPO_PUBLIC_GOOGLE_SIGN_IN` is unset. Apple's door stays on screen either way. |
| An application shows `○` and cannot be accepted | The applicant has not proved a mailbox yet. Waiting on them. |
| A second application is refused | One live application per account, by unique index. Answered ones free it. |
| The operator UI says "not an operator" | The account has no `operators` row *in the project the UI is pointed at*. A grant is per project; `npm run env` shows whether the scripts and the UI agree. A `db:reset` drops it. |
| `Could not find the table 'public.operators' in the schema cache` | You are pointed at a project that migration has not reached. The error names the project and the local command to use instead. |
| Operator sign-in says "Invalid login credentials" | One message covers a wrong password, an unknown address, and an account with no password set. `npm run dealers -- operator <email> --password "..."` fixes all three. |
| The operator UI loads blank and the console names `VITE_SUPABASE_URL` | No `operator/.env.local`. `npm run env -- local` writes it. |
| The deck is empty on a fresh `db:reset` | You are signed in as the account that claimed the seeded shop. The deck hides a shop from the person who claimed it. Importing the rows does not hide them, and the seed shop is unclaimed. |

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
it is the only thing that reaches a dealer. Both routes open with the buyer's name,
which is why onboarding asks for one.

**Email the shop** and **Ask about this watch** call `inquiry-draft` and hand the
draft to Gmail, through `src/lib/mail.ts`. A claimed shop is written to in the
thread instead, and that message never leaves as mail. Four addresses for the
same draft, and the first that opens wins:

| Where | What opens |
| --- | --- |
| iPhone | `googlegmail:///co`, the installed Gmail app |
| Android | Gmail's compose page, which the Gmail app claims |
| Browser | Gmail's compose page in a second window |
| Neither Gmail nor Mail | `mailto:`, then Gmail's compose page in a sheet inside the app |

`mailto:` alone opens Apple Mail, and Mail with no account looks like a dead
button, so it sits behind Gmail rather than in front of it. The in-app sheet is
last because Safari inside an app has kept its own cookies since iOS 11: it asks
the buyer to sign in to Google to reach a draft the Gmail app holds them signed
in for. It is there because a simulator has no Gmail and no Mail, which used to
make the button impossible to test.

On the web the window is opened with `window.open`, not `Linking.openURL`:
`openURL` assigns `window.location` there, so the composer would open by closing
Graham. A browser that blocks the window raises an error, and the buyer keeps
the app.

The dealer's address is not
encoded: an encoded `@` leaves the To line empty. Nothing is sent from our side, so the
function stamps `opened_at` and leaves `status` at `pending` — the buyer can still
close the composer without writing a word, and a lead we cannot confirm must not be
counted as one.

That function is the only way a dealer's address reaches a device.
`20260912000007_dealer_contact_privacy.sql` revokes `contact_email` from `anon` and
`authenticated` as a column grant, and that has to hold: the anon key ships inside the
app binary, so a readable column is every shop's mailbox one query away. One address,
for one watch a buyer deliberately asked about, is a different thing.

**Send via Graham** (`send-inquiry`) mails the dealer with the buyer's address as
Reply-To, so the reply still goes straight to them. This is the path for a device with
no mail client, and the only one that knows the mail left.

Both use the same subject line, from `_shared/listing-mail.ts`, so a dealer who gets
one of each sees one thread about one watch.

If the shop is unclaimed, a footer points them to sign in at `APP_ORIGIN/sign-in`
with that same address. Claiming still happens in the app; the footer is how they
find it, not proof they own the shop. Claimed shops get the lead only.

Locally the mail lands in Mailpit (http://127.0.0.1:54324), same inbox as sign-in
codes. In production set `RESEND_API_KEY` and the function uses Resend instead.
`APP_ORIGIN` defaults to `https://graham.watch`; set it to the deployed web origin
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
policies: the claim-dealer edge function writes a mailbox code, and
`operator_issue_claim_code` writes a handoff code. Only the definer functions
spend either. Codes are stored as a salted SHA-256, never in the clear.

The domain rule is the exact host with `www.` stripped, never a parent. Taking the
registrable domain would read `goldfinger.squarespace.com` as `squarespace.com`
and let anyone with an address there claim the shop. The cost is that a dealer at
`shop.com` cannot use `me@mail.shop.com`; they use the published-address path.

`enable_confirmations` must stay on. With it off GoTrue stamps `email_confirmed_at`
the moment anyone posts to `/auth/v1/signup`, which made path 1 a takeover: sign up
as the address a shop prints on its own contact page and the shop was yours.
`dealer_accounts` and `claim_dealer` also check `email_confirmed_at` directly, so
flipping the dashboard toggle cannot quietly reopen it.

The phone app cannot move a claim off an account. The operator console can:
**Unassign** on the Dealers row clears `claimed_by` and burns any live handoff
code. A dealer who loses the mailbox is handed the shop again with **Claim code**.

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

That file is production. `dealers`, `import`, `refresh` and `sweep` write there whenever
the repo is switched to hosted (`npm run env`). Re-read the warning at the top
of this document before running `add` or `remove`.

Nothing a dealer owns reaches another user's deck until you approve them.

`add` reads a contact address off the dealer's site — a `mailto:` link, the contact
page, sometimes the terms page. A dealer without one shows a warning in `list`, and
inquiries for their watches fail with "we have no address for this dealer yet".
Fix it with `set --email`.

`remove` deletes the photo files too. Foreign keys cascade the rows; storage has no
idea the listing is gone, so the CLI clears it.

`add` takes `--limit 10`, `--url <catalog>`, `--name "Shop"`, `--email <address>`,
and `--yes`. To re-run a shop already added, use `npm run import -- <url> --limit 10`.
It skips listings already imported, so a repeat costs nothing twice.

### Importer keys

The importer needs an OpenAI key to turn a scraped page into typed listings:

```
cp supabase/functions/.env.example supabase/functions/.env   # add OPENAI_API_KEY
npm run db:stop && npm run db:start
```

A function's container reads secrets when it is built, so editing the file is
not enough. Restart the stack as above, not with a container CLI. With no
scraping key, the importer falls back to plain `fetch`, which reads static HTML
only. Set `FIRECRAWL_API_KEY` or `JINA_API_KEY` for shops that render with
JavaScript. See [SCRAPING](SCRAPING.md).

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
| `preview` | Production-like, sideloaded. Android `.apk`. iOS still needs an Apple Developer account (ad hoc devices). Uses the `production` environment, so it talks to hosted Supabase. |
| `production` | Store / TestFlight. `autoIncrement` bumps the build number on Expo's servers. `EXPO_PUBLIC_DEMO` is forced off. |

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

`preview` reads that same `production` environment, so one pair covers both
install paths. Repeat for `development` only if a dev-client build should hit
hosted Supabase rather than `127.0.0.1`. Never put the service-role key here.

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

Only email codes work until Apple is configured in the hosted dashboard. The
button is on; the steps are in [AUTH](AUTH.md#apple). Google's door stays off
until `EXPO_PUBLIC_GOOGLE_SIGN_IN=1`.

A reply in a thread pushes to the other person's phone once they have allowed
notifications and the hosted database has the `device_push_tokens` migration.
The send happens in Postgres (`notify_message_push`), not in the app, so an
inquiry that opens a thread notifies a shop that has claimed its account and
installed the app. Expo Go cannot receive that push — the token would belong
to Expo's app, not Graham's.

The automated tests above the database are the Squarespace, Shopify, and
sitemap parsers, plus the operator UI's pasted-list parser. `test:rls` covers
every policy. The buyer and dealer screens are walked by hand. The Expo app
has no linter.

Demo mode reimplements the buyer surfaces in JavaScript rather than running the
real queries, so it can drift from the backend without anything failing. It is for
looking at the UI, never for confirming behaviour.
