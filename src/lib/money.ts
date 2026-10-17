/** Parse a dollar field into integer cents. Returns null when invalid. */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const dollars = Number(cleaned);
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  return Math.round(dollars * 100);
}

export function formatCents(cents: number, currency = 'USD'): string {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
      cents / 100
    );
  }
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

/** Estimated Graham fee from basis points (500 = 5%). */
export function feeCentsFromBps(amountCents: number, feeBps: number): number {
  return Math.floor((amountCents * feeBps + 4999) / 10000);
}
