import { layout } from './design.ts';

export const GRID_COLUMN_OPTIONS = [2, 3, 4, 5, 6] as const;

export type GridColumnOption = (typeof GRID_COLUMN_OPTIONS)[number];

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
