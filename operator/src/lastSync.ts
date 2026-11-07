/**
 * What the New on last sync cell says.
 *
 * The database returns a count of listings first seen on the latest catalogue
 * read. A shop with no `last_synced_at` has never had that read, so a count of
 * zero there is a different fact from a read that added nothing.
 */

export type LastSyncCell =
  | { kind: 'never' }
  | { kind: 'zero' }
  | { kind: 'count'; count: number };

export function lastSyncCell(
  lastSyncedAt: string | null | undefined,
  newCount: number,
): LastSyncCell {
  if (!lastSyncedAt) return { kind: 'never' };
  if (newCount <= 0) return { kind: 'zero' };
  return { kind: 'count', count: newCount };
}

export function lastSyncLabel(cell: LastSyncCell): string {
  if (cell.kind === 'never') return 'Never';
  if (cell.kind === 'zero') return '0';
  return String(cell.count);
}

export function lastSyncDetail(cell: LastSyncCell): string {
  if (cell.kind === 'never') {
    return 'No catalogue read yet. Sync or the nightly refresh will record one.';
  }
  if (cell.kind === 'zero') return 'The last catalogue read added no watches.';
  const watches = cell.count === 1 ? 'watch' : 'watches';
  return `${cell.count} ${watches} first seen on the last catalogue read.`;
}

export function additionTitle(brand: string | null, model: string | null): string {
  const title = [brand, model].filter((part) => part && part.trim()).join(' ');
  return title || 'Untitled';
}
