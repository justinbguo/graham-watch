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
- **Mailpit** http://127.0.0.1:54324 — catches sign-in emails, read your 6-digit code here

## Importing listings

```
npm run import -- https://dealer.example.com/watches
npm run dealers
npm run dealers -- approve <id-or-hostname>
```

Nothing a dealer owns reaches another user's deck until you approve them.

## Before committing

`npm run typecheck` and `npm run test:rls`. Both are fast. Neither proves the app
works, but a failure in either means it does not.

## Reading failures

A red screen is a JavaScript error; the stack trace prints in the Metro terminal.
That terminal also carries `console.log` output from the device. A `Bundled` line
with a module count means the code compiled and any problem is at runtime.

## Known limits

Apple and Google sign-in do not work in Expo Go — they need native code it cannot
load, which requires a development build. Email codes work everywhere.
