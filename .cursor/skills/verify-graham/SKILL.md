---
name: verify-graham
description: Drive the Graham Expo web app the way a buyer would and prove behavior with screenshots and aria snapshots. Use when verifying UI changes, swipe/deck/wishlist/search flows, or any claim that the app "works".
---

# Verify Graham

Graham is a swipe-based vintage-watch discovery app (Expo SDK 57 + Expo Router + Supabase). Agents prove behavior by launching an **owned** web instance, driving the real buyer path, and keeping evidence after cleanup.

The control surface is `control-graham`. Prefer it over ad-hoc `curl`, raw Playwright, or clicking in a Metro the user already had open.

```bash
CG="node .cursor/skills/verify-graham/bin/control-graham.mjs"
```

First-time on a machine: `(cd .cursor/skills/verify-graham && npm install)`.

## Modes

| Mode | When | Backend | Data |
| --- | --- | --- | --- |
| **demo** (default) | Cloud agents, UI-only proofs, no Docker | none (`EXPO_PUBLIC_DEMO=1`) | 6 fixtures in `src/lib/demo.ts` |
| **local** | Auth, messaging, dealer claim, RLS-shaped data | Colima + `npm run db:start` | `supabase/seed.sql` (~52 watches) + `npm run mock:users` |

Demo covers buyer surfaces only: deck, search, wishlist, profile, listing detail, inquiry mail draft. Dealer actions and `Send via Graham` are stubs — do not claim those verified in demo.

Never point verification at **hosted/production** for mutations. Hosted fixture setup (`mock:users -- --yes`) is for humans; agents use demo or local.

## Launch

```bash
$CG up --mode demo          # owned Metro + headed/headless Chrome keeper
$CG doctor                  # must pass before any drive
$CG info                    # url, pids, artifact dir
```

Ready means `doctor` reports `looksLikeGraham: true` (deck content or chrome visible), not merely that port 8081 answers. `up` picks a free port and records it; do not assume 8081.

Local mode (only when Colima + Supabase are up):

```bash
npm run db:start
$CG up --mode local
$CG seed                    # db:reset + mock:users
$CG signin ada              # prints a one-time code; local also auto-fills from Mailpit
```

### Auth and test users (local)

| Alias | Email | Role |
| --- | --- | --- |
| `ada` | `ada@graham.test` | Buyer |
| `bea` | `bea@graham.test` | Buyer (peer thread) |
| `dealer` | `dealer@graham.test` | Owns Mock Desk |
| `gold` | `gold@graham.test` | Owns Goldfinger's Vintage |

Local codes land in Mailpit (`http://127.0.0.1:54324`) and the app auto-reads them when the Supabase URL is local. Never sign in as `seed-shop@graham.test` — the deck hides that shop's watches from whoever added them.

Guest web (demo and local unsigned): Buy is open; after `GUEST_SWIPE_BUDGET` (10) judgments the sign-in sheet opens. Header **Log in** is the deliberate entry.

## Doctor

```bash
$CG doctor
```

Checks: Metro pid alive, browser keeper alive, HTTP to the owned URL, page body looks like Graham. Exit 2 on failure. Run doctor first whenever anything looks off.

## Drive

Stable handles over coordinates. On the deck, prefer keyboard (the product already teaches arrows on web):

| Action | Command |
| --- | --- |
| Pass | `$CG press ArrowLeft` |
| Save | `$CG press ArrowRight` |
| Toggle card/grid | `$CG press s` |
| Open Wishlist tab | `$CG click --name Wishlist` |
| Open Buy tab | `$CG click --name Buy` |
| Open search | `$CG aria-click --role button --name "Search brand, model or reference"` |
| Snapshot | `$CG snapshot` |
| Screenshot | `$CG screenshot` |
| Wait | `$CG wait-settle` |

More commands: `home`, `goto <path>`, `fill`, `type`, `eval`, `console`, `network-summary`. Run `$CG help`.

Read `features/README.md`, then the matching feature file. Drive one mapped entry point; do not invent a shorter path and call the feature verified.

## Evidence

Artifacts land in `.cursor/skills/verify-graham/artifacts/<run-id>/` and **survive** `cleanup`.

Proof standards:

- Exercise the real user path (swipe/keyboard/tab), not internal setters.
- Capture the action and the resulting state (before/after snapshots or screenshots).
- In demo, wishlist state is in-memory for the browser session — a reload clears it; that is expected.
- Mocks only where production already isolates the boundary (demo mode itself).

## Cleanup

```bash
$CG cleanup
```

Stops the Metro process and browser keeper **this run started**. Does not delete artifacts. Does not kill foreign Metro processes. Never kill by process name (`pkill expo`).

## Isolate

One active run at a time (`.runs/active.json`). `up` refuses if that run's Metro is still alive. Demo swipe state is per browser context; local DB is shared — `seed` resets it and will disrupt a human using the same local stack. Say so before seeding.

## Helpers

```bash
node .cursor/skills/verify-graham/bin/control-graham.mjs <command>
```

Requires Playwright under `.cursor/skills/verify-graham/` (gitignored `node_modules`). Chrome/Chromium on the machine (`google-chrome` or Playwright channel).

## Feature map

See [features/README.md](features/README.md).
