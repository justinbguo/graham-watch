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

- Demo `doctor` green on Buy.

- **Open.** `aria-click --role button --name "Search brand, model or reference"` (or `click --name "Search brand, model or reference"`). `wait-settle`. URL or UI shows search.
- **Match.** `fill --name "Search brand, model or reference" --value "Omega"` (or the search field's accessible name on that screen). Snapshot lists Omega Speedmaster; Rolex may be absent.
- **Miss.** Clear/fill with `zzzxnotawatch`. Snapshot shows empty / no-match state, not a crash.
- **Proof.** `artifacts/<id>/search.aria.yml` and `search.png` with the query and a matching title (or empty state).

## Gotchas

- Search and the deck share catalogue rules in local mode; demo search reads the same six fixtures.
- Wait for results after typing; do not assert on a single frame mid-debounce.
- Filters (`Filters` control) are a separate surface — prove them only when the task names filters.
