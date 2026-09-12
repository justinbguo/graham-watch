/**
 * Runs `work` over `items` with at most `concurrency` in flight, preserving
 * input order. Imports fan out to servers we do not control — a dealer's site
 * and OpenAI — so the choice is between serialising everything and flooding
 * someone else's origin.
 */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  work: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await work(items[index]);
      }
    })
  );

  return results;
}
