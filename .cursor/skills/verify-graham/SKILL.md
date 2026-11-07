---
name: verify-graham
description: "Drive Graham locally and prove a user flow. Covers the Expo web build, the local Supabase stack (auth, database, edge functions), and the points where the operator console reads the same stack. Use after a change to the app, Drops, import, or auth, before calling the work done."
---

# Verify Graham

Graham's primary surface is the Expo app. Verification drives the web export against one local Supabase stack. The operator console is a separate Vite app on the same stack. Phone push delivery is not exercised on a device. Pushes are captured locally and never sent to Expo.

There is one local stack, `project_id` `graham-watch`, API `http://127.0.0.1:54321`, web `http://127.0.0.1:8091`. Do not start a second stack or a second web server. Refusing to share an instance you did not start beats driving someone else's session.

Never call the hosted project `hbxgxtbtefpyutyqafoi`. The harness checks every URL and exits if that ref or any non-local host appears. It does not read `scripts/.env.operator.local`.

Read [features/README.md](features/README.md) before driving a feature.

## Launch

From the repo root, with Docker running and dependencies installed (`npm ci`):

```bash
node .cursor/skills/verify-graham/control-graham.mjs up
```

`up` is ready when stdout is JSON with `"ok": true`, `"ready": true`, and `"url": "http://127.0.0.1:54321"`. That means `supabase start` applied migrations and `supabase/seed.sql`, a dealers read succeeded, the push capture container is on the Supabase network, and `.env.local` points the app at that stack. A health check that returns before the dealers read is not ready. `up` waits for the read.

`up` starts the database, auth, API, mailpit, and edge runtime. It does not start Studio, realtime, imgproxy, logflare, vector, or postgres-meta. The database CI job still starts the full stack. Verification does not need those services.

Then:

```bash
node .cursor/skills/verify-graham/control-graham.mjs web
```

`web` is ready when stdout has `"url": "http://127.0.0.1:8091"` and a browser can load it. The first run exports the Expo web build into `.cursor/skills/verify-graham/.run/web` (several minutes) and serves it. A later run reuses the pid in `.cursor/skills/verify-graham/.run/state.json` when that process is still `web-server.mjs`.

Mailpit, the local inbox, is `http://127.0.0.1:54324`. The web export does not proxy it. The screenshot command reads the code from Mailpit and types it. That is the same code a person would type.

Teardown is Cleanup, below.

## Doctor

```bash
node .cursor/skills/verify-graham/control-graham.mjs doctor
```

Read-only. Run it before the first drive and again after anything surprising.

Drive only when all of these hold:

- `docker` and `supabaseCli` are true
- `stack.url` is `http://127.0.0.1:54321` and `stack.apiOk` is true
- `stack.refused` is absent
- before `notify-drops`: `functions.runtimeExpoPushUrl` is `http://graham-push-capture:8799/push` and `capture` is true
- before `screenshot`: `web.url` is `http://127.0.0.1:8091`

`stack: null` means run `up`. `apiOk: false` means the process is up and the data is not. Do not drive it.

## Drive

The harness is `control-graham`. Stdout is one JSON object. Progress is on stderr. `--dry-run` prints the plan and changes nothing. It is honored on `up`, `seed`, `sign-in`, `follow`, `import`, `notify-drops`, `web`, `reset-proof`, `cleanup`, `verify-drops`, and `verify-operator`.

```bash
node .cursor/skills/verify-graham/control-graham.mjs doctor
node .cursor/skills/verify-graham/control-graham.mjs up
node .cursor/skills/verify-graham/control-graham.mjs seed
node .cursor/skills/verify-graham/control-graham.mjs sign-in buyer
node .cursor/skills/verify-graham/control-graham.mjs follow buyer dealer
node .cursor/skills/verify-graham/control-graham.mjs follow quiet dealer
node .cursor/skills/verify-graham/control-graham.mjs import
node .cursor/skills/verify-graham/control-graham.mjs notify-drops
node .cursor/skills/verify-graham/control-graham.mjs drops-status buyer
node .cursor/skills/verify-graham/control-graham.mjs drops-status quiet
node .cursor/skills/verify-graham/control-graham.mjs web
node .cursor/skills/verify-graham/control-graham.mjs tour <dealerId>
node .cursor/skills/verify-graham/control-graham.mjs verify-drops
node .cursor/skills/verify-graham/control-graham.mjs verify-operator
node .cursor/skills/verify-graham/control-graham.mjs cleanup
```

`npm run verify:drops` is `verify-drops`.

Fixture people, created by `seed`:

| Name | Email | Role |
| --- | --- | --- |
| `buyer` | `buyer@graham.test` | Buyer with push token `ExponentPushToken[grahamverifybuyer01]` |
| `quiet` | `quiet@graham.test` | Buyer with no push token |
| `dealer` | `bench@graham.test` | Owns the approved shop Test Bench |

`sign-in` uses GoTrue's email code, not a password. It prints `userId` and a local `accessToken`. Do not copy that token anywhere but this machine.

`follow` inserts `dealer_follows` as that user. `import` posts `action: "fixture"` to the local `import-listings` function as the dealer. The function writes one active listing and does not call OpenAI or fetch a shop site. The hosted function refuses this action.

`notify-drops` POSTs to the local function with the service-role JWT and `x-graham-cron-secret`. The edge runtime's `EXPO_PUSH_URL` is `http://graham-push-capture:8799/push`. The function ignores that override unless `SUPABASE_URL` is a local host, so a hosted function still posts to `https://exp.host/--/api/v2/push/send`.

`screenshot` opens the route in headless Chromium at 390×844. It signs in through the sheet: button `Log in or create an account`, button `Continue with email`, placeholder `you@example.com`, textbox `Sign-in code`, button `Continue`. The sheet then returns to Buy. `/messages` presses the Messages tab and waits for the button whose accessible name matches `New from dealers you follow, <count>`. `/profile` presses Profile and checks that the drops row is gone. `/drops` opens the feed.

`tour <dealerId>` does that sign-in once and writes the Messages badge, Profile without the drops row, the drops feed, the one-dealer deep link, and a video.

Stable handles for the Drops proof, not coordinates:

- Guest gate: button `Log in or create an account`. On web, Buy also opens that sheet by itself, so `Continue with email` can already be on screen.
- Email door: button `Continue with email`
- Code field: `Sign-in code`
- Unseen count: button `New from dealers you follow, N` on Messages
- Phone-width tab: tab `Messages, N`
- Following row: button `Test Bench, verified`
- Drops feed: text `New watches` and button `Fixture Drop, 1968`

## Evidence

Proof files live in `/opt/cursor/artifacts/verify-graham` when `/opt/cursor/artifacts` exists, otherwise `artifacts/verify-graham` at the repo root. `cleanup` does not delete that directory.

`verify-drops` writes:

- `messages.png` — Messages after email sign-in, with the unseen count on the tab and the drops row
- `profile.png` — Profile after the same sign-in, Following present, no drops row and no Profile badge
- `drops.png` — the New watches feed opened from that row
- `deep-link.png` — `/drops?dealerId=<id>`, the one-shop push target
- `drops-messages.webm` — the same path, in order
- `report.json` — assertions, skip counts, the notification row, the captured push
- `notify.json` — the function's JSON response and the captured Expo body

Standards for a proof:

- Exercise the user path. Follow is the same `dealer_follows` insert the app performs. Sign-in on web types the Mailpit code. The badge is the Messages button and the Messages tab, not a direct DOM edit.
- Capture the action and the resulting state. `notify-drops` records the function response and the body the capture server stored. `drops-status` reads `drop_notifications` and `unseen_drop_count` as the buyer.
- Check side effects. Exactly one `drop_notifications` row for the buyer, status `sent`, title `New watches`, listing id equal to the import. Exactly one captured push to the buyer's token, `data.kind` `drop`, `data.dealerId` the Test Bench id, `data.dropNotificationId` the row id. The quiet follower has no row and no push. The response's `skipped.noTokenWithListings` is at least 1.
- The push mock is the production boundary. `notify-drops` already posts to Expo's URL. Locally that URL is a capture server. Confirm the capture file received the payload. An empty capture with `sent: 1` is a failure, not a pass.
- `--dry-run` does not open a socket to the function and does not start Docker. Trust that only after you see `"dryRun": true` and no new rows.

The one proven flow is Drops. The map lists the other features so a later run can cover them. Do not report those as verified because Drops passed.

## Cleanup

```bash
node .cursor/skills/verify-graham/control-graham.mjs cleanup
```

This stops only what the harness started:

- SIGTERM to the web pid in `.run/state.json`, and only when `/proc/<pid>/cmdline` contains `web-server.mjs`
- `docker rm -f graham-push-capture` (that name only)
- `supabase stop` in this repo, which stops the `graham-watch` project

It does not delete evidence, and it does not kill processes by name. `verify-drops` runs cleanup after the proof and then checks that `messages.png`, `profile.png`, `drops.png`, `deep-link.png`, `drops-messages.webm`, and `report.json` are still on disk. If any are gone, the run fails.

After a failed attempt, run `cleanup` before starting again so ports and containers are not left behind. Evidence from the failed attempt stays.

## Helpers

| Script | Invocation |
| --- | --- |
| Harness | `node .cursor/skills/verify-graham/control-graham.mjs <command>` |
| Push capture | Started by `up` as container `graham-push-capture`, running `node /app/capture-server.mjs` |
| Web server | Started by `web`: `node .cursor/skills/verify-graham/web-server.mjs <export-dir> 8091` |
| Fixture watch | `.cursor/skills/verify-graham/fixtures/drop-watch.json`, sent by `import` |
| CI | `npm run verify:drops` |

`capture-server.mjs` listens on port 8799 inside the Supabase docker network and appends each POST `/push` to `.run/pushes.json`. It answers with an Expo-shaped `{ data: [{ status: "ok", id }] }`. It has no route to exp.host.

## Maintenance

`/maintain-verification-skill` is the upkeep loop. This directory is the target: the skill name is `verify-graham`, the body has Launch and Drive, and the feature map is [features/README.md](features/README.md) plus the sibling files. Keep run notes out of git. `.run/` is scratch and is gitignored.

## What this environment did that a normal runner does not

Proved on a Linux VM whose Docker had an `iptables-legacy` FORWARD policy of DROP, which blackholed IPv4 between containers, and whose daemon had no IPv6 while the Realtime image sets `ECTO_IPV6=true`. `up` repairs the FORWARD policy when it is DROP. It does not edit `/etc/docker/daemon.json`. A GitHub-hosted runner's Docker already forwards container traffic, so that daemon change is not part of the proof there. The CI job runs the same `npm run verify:drops` without it.
