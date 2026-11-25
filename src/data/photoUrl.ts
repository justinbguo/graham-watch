export const LISTING_PHOTO_WIDTH = 1200;

export function boundDealerPhoto(url: string, width = LISTING_PHOTO_WIDTH): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.hostname === 'images.squarespace-cdn.com') {
    parsed.searchParams.set('format', `${width}w`);
    return parsed.toString();
  }
  if (parsed.hostname === 'cdn.shopify.com' || parsed.pathname.includes('/cdn/shop/')) {
    parsed.searchParams.set('width', String(width));
    return parsed.toString();
  }
  return url;
}
