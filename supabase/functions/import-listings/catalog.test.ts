import { assertEquals } from 'jsr:@std/assert@1';

import { everyRow, PAGE_ROWS, readStamp } from './catalog.ts';

Deno.test('catalogue rows past the first PostgREST page are kept', async () => {
  const calls: Array<[number, number]> = [];
  const rows = await everyRow(async (from, to) => {
    calls.push([from, to]);
    if (from === 0) {
      return {
        data: Array.from({ length: PAGE_ROWS }, (_, index) => ({ id: String(index) })),
        error: null,
      };
    }
    return { data: [{ id: String(PAGE_ROWS) }], error: null };
  });

  assertEquals(rows.length, PAGE_ROWS + 1);
  assertEquals(calls, [
    [0, PAGE_ROWS - 1],
    [PAGE_ROWS, PAGE_ROWS * 2 - 1],
  ]);
});

Deno.test('a repeated page stops the walk instead of looping', async () => {
  const page = Array.from({ length: PAGE_ROWS }, (_, index) => ({ id: String(index) }));
  const rows = await everyRow(async () => ({ data: page, error: null }));
  assertEquals(rows.length, PAGE_ROWS);
});

Deno.test('a read stamp from another day is replaced', () => {
  const now = Date.parse('2026-11-08T12:00:00.000Z');
  assertEquals(readStamp('2026-11-08T11:00:00.000Z', now), '2026-11-08T11:00:00.000Z');
  assertEquals(readStamp('2026-11-01T11:00:00.000Z', now), '2026-11-08T12:00:00.000Z');
  assertEquals(readStamp(undefined, now), '2026-11-08T12:00:00.000Z');
});
