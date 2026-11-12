import candidatesCsv from './fixtures/nonwatch-candidates.csv' with { type: 'text' };
import { classifyCatalogueItem } from './nonwatch.ts';

type CsvRow = {
  id: string;
  dealer: string;
  title: string;
  url: string;
  category: string;
  reason: string;
};

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const [header, ...body] = rows;
  const at = (name: string) => header.indexOf(name);
  return body.filter((cells) => cells.length > 1).map((cells) => ({
    id: cells[at('id')] ?? '',
    dealer: cells[at('dealer')] ?? '',
    title: cells[at('title')] ?? '',
    url: cells[at('url')] ?? '',
    category: cells[at('category')] ?? '',
    reason: cells[at('reason')] ?? '',
  }));
}

function productTypeFromAudit(row: CsvRow): string | null {
  const named = row.reason.match(/product type is '([^']+)'/);
  if (named) return named[1];
  const stopwatch = /\bstop\s*-?\s*watch(?!ing)/i.test(row.title) &&
    !/pocket\s*watch|pocketwatch/i.test(row.title);
  return stopwatch ? 'Pocket Watches' : null;
}

const rows = parseCsv(candidatesCsv).map((row) => {
  const decision = classifyCatalogueItem({
    title: row.title,
    text: '',
    productType: productTypeFromAudit(row),
    tags: [],
    vendor: null,
    sourceUrl: row.url,
  });
  return {
    ...row,
    outcome: decision.decision === 'hold' ? decision.reason : 'pass',
    rule: decision.decision === 'hold' ? decision.rule : null,
  };
});

const byCategory: Record<string, Record<string, number>> = {};
for (const row of rows) {
  byCategory[row.category] ??= {};
  byCategory[row.category][row.outcome] = (byCategory[row.category][row.outcome] ?? 0) + 1;
}

const passed = rows.filter((row) => row.outcome === 'pass');
console.log(JSON.stringify({ total: rows.length, byCategory, passed }, null, 2));
