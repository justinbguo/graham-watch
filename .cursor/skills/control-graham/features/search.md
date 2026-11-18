# Search

Search asks the catalogue by brand, model, or reference. On web it opens from the Buy header search control.

## Sub-features

- `search-open` opens the search surface from Buy.
- `search-query` filters results for a known demo brand.
- `search-empty` shows no matches for nonsense input.

## How to get to it (user POV)

- On Buy, choose the search control labeled `Search brand, model or reference`.
- Type a query into the search field.

## Driving it with control-graham

Preconditions:

- Demo `doctor` green on Buy. Demo is signed in, so the search control is not under a sign-in sheet.

- **Open.** `aria-click --role button --name "Search brand, model or reference"` (or `click --name "Search brand, model or reference"`). `wait-settle`. URL or UI shows search.
- **Match.** `fill --name "Search brand, model or reference" --value "Omega"` (or the search field's accessible name on that screen). Snapshot lists Omega Speedmaster; Rolex may be absent.
- **Miss.** Clear/fill with `zzzxnotawatch`. Snapshot shows `No watches match. Loosen a filter.`, not a crash.
- **Proof.** `artifacts/<id>/search.aria.yml` and `search.png` with the query and a matching title (or empty state).

## Gotchas

- Unsigned web shows the arrival sheet until `Close` or `Not now`. Demo does not.
- The Buy door and the search field share the name `Search brand, model or reference`. `fill` types into the textbox. The door is a button and is not the field.
- Search and the deck share catalogue rules in local mode, so a Rolex and a year after 1985 are absent there. Demo search reads the same six fixtures, including the Rolex.
- Wait for results after typing; do not assert on a single frame mid-debounce.
- Filters (`Filters` control) are a separate surface — prove them only when the task names filters.
