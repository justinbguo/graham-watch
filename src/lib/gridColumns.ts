import { layout } from './design.ts';

/** Wide-grid choices. A phone does not offer these. */
export const GRID_COLUMN_OPTIONS = [2, 3, 4, 5, 6] as const;

export type GridColumnOption = (typeof GRID_COLUMN_OPTIONS)[number];

export function isGridColumnOption(value: number): value is GridColumnOption {
  return (GRID_COLUMN_OPTIONS as readonly number[]).includes(value);
}

/**
 * Phone width stays at two. A wide window uses an explicit pick when there is
 * one, otherwise the width-based count, never past six.
 */
export function gridColumnsFor(input: {
  wide: boolean;
  desktopWeb: boolean;
  automatic: number;
  chosen: GridColumnOption | null;
}): number {
  if (!input.wide) return layout.gridColumnsPhone;
  if (input.chosen != null) return input.chosen;
  const automatic = input.desktopWeb ? input.automatic : layout.gridColumns;
  return Math.min(layout.gridColumnsMax, Math.max(layout.gridColumnsWeb, automatic));
}
