# New

New is the tab of watches the latest catalogue batch put on the deck. It is not the Drops feed. Drops is `New watches` under Messages, and only for shops the buyer follows. Opening New clears its count on this device until a different batch id is sealed.

## Sub-features

- `new-tab`: the tab named `New`. In demo the badge is the batch size, spoken `New, 3`.
- `new-list`: three demo fixtures and the line `3 watches from last night's update.`
- `new-empty`: on a local stack with no sealed batch, `New watches appear here after the nightly update.` The tab has no badge.

## How to get to it (user POV)

Open the app and choose New. Guests see it too. A row opens the listing. The count clears after the tab is opened, including in demo, where the stored batch id is `demo-batch`.

## Driving it with control-graham

Preconditions:

- Demo `up` and `doctor` with `looksLikeGraham: true`. Demo is signed in.

- **Open.** `click --name "New, 3"`. `wait-settle`.
- **List.** `snapshot` shows `3 watches from last night's update.` and `Omega Speedmaster Professional, 1972`.
- **Proof.** `artifacts/<id>/new.*`. Do not treat a Drops screenshot as this tab.

## Gotchas

- New uses Buy's header, so the screen has no title `New`. The tab is still `New`. The Drops screen title is `New watches`.
- Demo seals three fixtures when the bundle loads, so the subtitle says last night while the timestamp is this session. Those three stay in fixture order: Omega, then Rolex, then Heuer. Shop seating applies to a sealed batch on a local database, and that seal omits a Rolex and a year after 1985. Demo does not reseat this tab and does not apply that omission.
- A local database with no `seal_catalogue_batch` row shows the empty line and a tab named `New` with no count. `seed` does not seal a batch.
