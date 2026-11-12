export function unseenNewCount(
  batch: { id: string; size: number } | null,
  seenBatchId: string | null,
): number {
  if (!batch || batch.size < 1) return 0;
  if (seenBatchId === batch.id) return 0;
  return batch.size;
}
