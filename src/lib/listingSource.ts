/** The dealer page already stored on the listing, or nothing when it is blank. */
export function listingSourceUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  return trimmed.length > 0 ? trimmed : null;
}
