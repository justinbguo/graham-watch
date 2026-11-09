import { inset, layout, space } from './design.ts';

export const GRID_COLUMN_OPTIONS = [2, 3, 4, 5, 6] as const;

export type GridColumnOption = (typeof GRID_COLUMN_OPTIONS)[number];

/** Desktop Buy rail Display control: one is the card deck, the rest are grid columns. */
export const DECK_DENSITY_MIN = 1;
export const DECK_DENSITY_MAX = GRID_COLUMN_OPTIONS[GRID_COLUMN_OPTIONS.length - 1];

export function isGridColumnOption(value: number): value is GridColumnOption {
  return (GRID_COLUMN_OPTIONS as readonly number[]).includes(value);
}

export function gridColumnsFor(
  wide: boolean,
  automatic: number,
  chosen: GridColumnOption | null,
): number {
  if (!wide) return layout.gridColumnsPhone;
  if (chosen != null) return chosen;
  return Math.min(layout.gridColumnsMax, Math.max(layout.gridColumnsWeb, automatic));
}

const COLUMN_GAP = space.sm;

/**
 * Where one desktop grid row sits inside the list.
 *
 * A row held to `deckGridTileCap` is centred in the column beside the rail.
 * Centring on the window would leave it against the rail, with the spare
 * width still on the right. A row that fills the column keeps `inset.screen`
 * before the window's right edge.
 */
export function deckGridFrame({
  columns,
  listWidth,
}: {
  columns: number;
  listWidth: number;
}): { tileWidth: number; rowPadLeft: number; rowPadRight: number } {
  const gaps = COLUMN_GAP * Math.max(columns - 1, 0);
  const width = Math.max(0, listWidth);
  const share = columns > 0 ? (width - gaps) / columns : 0;
  const capped = share > layout.deckGridTileCap;
  const edge = capped ? 0 : inset.screen;
  const inner = Math.max(0, width - edge);
  const fitted = columns > 0 ? (inner - gaps) / columns : 0;
  const tileWidth = fitted > 0 ? Math.floor(Math.min(fitted, layout.deckGridTileCap)) : 0;
  const slack = Math.max(0, inner - (tileWidth * columns + gaps));

  if (width <= 0 || tileWidth <= 0) {
    return { tileWidth: 0, rowPadLeft: 0, rowPadRight: 0 };
  }
  if (!capped) {
    return { tileWidth, rowPadLeft: 0, rowPadRight: edge + slack };
  }
  const lead = Math.round(slack / 2);
  return { tileWidth, rowPadLeft: lead, rowPadRight: slack - lead };
}
