import type { DealerIdentity } from '@/lib/models';

function presentText(value: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function presentDealerIdentity(row: DealerIdentity): DealerIdentity {
  return {
    ...row,
    description: presentText(row.description),
    website: presentText(row.website),
    instagram: presentText(row.instagram),
  };
}
