# Operating Graham

Day-to-day commands and habits. Setup lives in the [README](../README.md); this is
what to do once it is set up.

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

- `.env` (environment variables are inlined at bundle time)
- Installing or removing a package
- `app.json`
- Metro or Babel config

Still stale or behaving strangely? `npx expo start --clear` wipes Metro's cache.

## Database

`npm run db:reset` is the undo button: drops everything, re-runs every migration in
order, re-seeds. Nothing local is precious.

| After you change | Run |
| --- | --- |
| The schema | `npm run db:types` — or TypeScript lies about your columns |
| A security policy | `npm run test:rls` |

Migrations are append-only once they have run. Never edit one; add a new file.

Two interfaces worth bookmarking:

- **Studio** http://127.0.0.1:54323 — browse and edit rows
- **Mailpit** http://127.0.0.1:54324 — every email the app sends

## Signing in locally

No email ever leaves your machine. Supabase runs a fake mail server, so sign-in codes
land in Mailpit instead of a real inbox — checking Gmail will never show one.

1. Type any address in the app. `a@b.c` works as well as your real one.
2. Open http://127.0.0.1:54324 and read the 6-digit code from the newest message.

The account is created on first use. Codes expire after an hour.

## Managing dealers

```
npm run dealers                          # who is in, and whether we can email them
npm run dealers -- add <domain>          # discover, preview, import, approve
npm run dealers -- set <id|host>         # re-read their name and address from their site
npm run dealers -- stats <id|host>       # saves and inquiries per watch
npm run dealers -- remove <id|host>      # delete them, their listings and their photos
npm run dealers -- approve <id|host>
npm run dealers -- revoke <id|host>
```

Nothing a dealer owns reaches another user's deck until you approve them.

`add` reads a contact address off the dealer's site — a `mailto:` link, the contact
page, sometimes the terms page. A dealer without one shows a warning in `list`, and
inquiries for their watches fail with "we have no address for this dealer yet".
Fix it with `set --email`.

`remove` deletes the photo files too. Foreign keys cascade the rows; storage has no
idea the listing is gone, so the CLI clears it.

## Inquiry email

A buyer swipes right to save. Sending an inquiry is a separate, deliberate act, and
it is the only thing that emails a dealer. The mail comes from Graham with the
buyer's address as Reply-To, so the dealer's reply goes straight to them. It opens
with the buyer's name, which is why onboarding asks for one.

Locally the mail lands in Mailpit (http://127.0.0.1:54324), same inbox as sign-in
codes. In production set `RESEND_API_KEY` and the function uses Resend instead.

A send that fails leaves the inquiry at `failed`. The buyer can try again — the
second attempt reuses the same row rather than being told they already asked.

## What a dealer may know

`npm run dealers -- stats` shows counts only: how many people saved a watch and how
many asked about it. It never shows who. Buyers' swipes stay private to them, and
the function refuses to run for anyone but the person who added the dealer.

## Before committing

`npm run typecheck` and `npm run test:rls`. Both are fast. Neither proves the app
works, but a failure in either means it does not.

## Reading failures

A red screen is a JavaScript error; the stack trace prints in the Metro terminal.
That terminal also carries `console.log` output from the device. A `Bundled` line
with a module count means the code compiled and any problem is at runtime.

## Known limits

Only email codes are enabled. Apple and Google are written but switched off until
they have credentials, so neither button appears. See the README for what turning
them on takes.

Apple additionally cannot run in Expo Go — it needs native code Expo Go cannot load,
which means a development build.
