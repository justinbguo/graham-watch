/**
 * Formatting shared by the two ways a dealer hears about a watch: the mail
 * Graham sends, and the draft we hand a buyer's own mail client.
 *
 * Shared rather than written twice because both print a price. Two copies of
 * this that drift are two different numbers quoted to the same dealer for the
 * same watch, and the dealer has no way to know which one we meant.
 */

export type MailListing = {
  brand: string | null;
  model: string | null;
  reference: string | null;
  year: number | null;
  price_cents: number | null;
  currency: string | null;
  source_url: string;
};

export function price(cents: number | null, currency: string | null): string {
  if (cents === null) return 'price on request';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency ?? 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** "1972 Omega Speedmaster Professional", or as much of it as we imported. */
export function watchName(listing: MailListing): string {
  const named = [listing.brand, listing.model].filter(Boolean).join(' ');
  if (!named) return 'a watch';
  return listing.year ? `${listing.year} ${named}` : named;
}

/** The same line in the subject of both mails, so a dealer's thread matches. */
export function watchSubject(listing: MailListing): string {
  const name = watchName(listing);
  return listing.reference ? `${name} (ref. ${listing.reference})` : name;
}
