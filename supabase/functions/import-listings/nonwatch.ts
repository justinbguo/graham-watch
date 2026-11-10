import type { SourceItem } from './source.ts';

export const HOLD_REASONS = ['strap', 'accessory', 'clock'] as const;

export type HoldReason = (typeof HOLD_REASONS)[number];

export type CatalogueFields = {
  title: string;
  text: string;
  productType: string | null;
  tags: string[];
  vendor: string | null;
};

export type CatalogueDecision =
  | { decision: 'watch' }
  | { decision: 'hold'; reason: HoldReason; rule: string };

const CLOCK_TYPE = /\bclocks?\b/i;
const ACCESSORY_TYPE =
  /\b(tools?|winders?|boxes|cases?|trays?|accessor\w*|pouches?|rolls?|cuff\s*links?)\b/i;
const STRAP_TYPE = /\b(straps?|bands?|bracelets?|buckles?|clasps?|natos?|two[\s-]?piece)\b/i;

/**
 * Shops file a product under a path. Google's is
 * "Jewelry & Watches > … > Wristwatches". The leaf is the shop's own type.
 * An ancestor that says Accessories or Jewelry does not describe the product.
 */
export function catalogueTypeLeaf(productType: string | null): string {
  if (!productType) return '';
  const parts = productType.split(/\s*(?:>|\/)\s*/).filter((part) => part.trim());
  return (parts[parts.length - 1] ?? '').trim();
}

const STRAP_TAG = new Set(['strap', 'straps', 'watch strap', 'bracelet', 'bracelets']);
const ACCESSORY_TAG = new Set([
  'tool',
  'tools',
  'accessory',
  'accessories',
  'winder',
  'winders',
  'tray',
  'trays',
]);

function fold(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function hasYearOrReference(title: string): boolean {
  return /\b(?:19|20)\d{2}\b/.test(title) || /\b\d{4,6}\b/.test(title);
}

const WATCH_SHAPED: RegExp[] = [
  /\bpuzzle\s+bracelet\b/i,
  /\b56059\s*ba\b/i,
  /\broyal\s+oak\b/i,
  /\bintegrated\s+bracelet\b/i,
  /\bbuben\b[\s\S]{0,40}\b(?:zorweg|the one)\b/i,
  /\b(?:zorweg|the one)\b[\s\S]{0,40}\bbuben\b/i,
  /\bpocket\s+watch\b/i,
  /\b(?:on|with|fitted with|attached to|comes with|including|having)\b(?:\s+\w+){0,6}\s+(?:an?\s+|the\s+)?(?:leather\s+|oyster\s+|jubilee\s+|president(?:ial)?\s+|integrated\s+)?(?:bracelets?|straps?|bands?)\b/i,
];

function watchShaped(title: string, text: string): boolean {
  const blob = `${title}\n${text}`;
  if (WATCH_SHAPED.some((pattern) => pattern.test(blob))) return true;
  return /\bbox(?:es)?\b/i.test(blob) && /\bpapers?\b/i.test(blob);
}

function clockSignal(title: string, productType: string | null, tags: string[]): boolean {
  const leaf = catalogueTypeLeaf(productType);
  if (CLOCK_TYPE.test(title) || (leaf && CLOCK_TYPE.test(leaf))) return true;
  return tags.some((tag) => fold(tag) === 'clock' || fold(tag) === 'clocks');
}

function accessoryTitle(title: string): boolean {
  if (/\btrays?\b/i.test(title)) return true;
  if (/\bwinders?\b/i.test(title)) return true;
  if (/\btools?\b/i.test(title) && !/\bwatches?\b/i.test(title)) return true;
  if (/\bwatch\s+box(?:es)?\b/i.test(title) && !/\bpapers?\b/i.test(title)) return true;
  return false;
}

/** A title that names the watch, not the strap it is sold on. */
function watchNamedInTitle(title: string): boolean {
  if (/\bdial\b/i.test(title)) return true;
  if (/\bsub\b/i.test(title)) return true;
  return /\bwatch(?:es)?\b/i.test(title) && !/\bwatch\s+straps?\b/i.test(title);
}

function strapTitle(title: string): boolean {
  if (/\bbuckles?\b/i.test(title) && title.length <= 40 && !hasYearOrReference(title)) return true;
  if (watchNamedInTitle(title)) return false;
  if (/\bstraps?\b/i.test(title)) return true;
  if (/\b(?:oyster|jubilee|president(?:ial)?)\b.{0,24}\bbracelets?\b/i.test(title)) return true;
  if (/\bbracelets?\b/i.test(title) && /\b\d+\s*mm\b/i.test(title)) return true;
  if (/\bheavy\s+bracelets?\b/i.test(title)) return true;
  if (/\bbark\s+finish\s+bracelets?\b/i.test(title)) return true;
  if (/\b(?:rose|white|yellow)\s+gold\s+bracelets?\s*$/i.test(title)) return true;
  return false;
}

function strapConstruction(title: string, text: string): boolean {
  if (hasYearOrReference(title)) return false;
  const blob = `${title}\n${text}`;
  const dimensions = /\b\d{2,3}\s*\/\s*\d{2,3}\s*mm\b/i.test(blob);
  const strapWord = /\b(?:straps?|bracelets?|bands?)\b/i.test(blob);
  return dimensions && strapWord;
}

function tagReason(tags: string[], title: string): HoldReason | null {
  if (hasYearOrReference(title)) return null;
  for (const tag of tags) {
    const name = fold(tag);
    if (STRAP_TAG.has(name)) return 'strap';
    if (ACCESSORY_TAG.has(name)) return 'accessory';
  }
  return null;
}

function hold(reason: HoldReason, rule: string): CatalogueDecision {
  return { decision: 'hold', reason, rule };
}

export function classifyCatalogueItem(fields: CatalogueFields): CatalogueDecision {
  const title = fields.title ?? '';
  const text = fields.text ?? '';
  const productType = fields.productType;
  const tags = fields.tags ?? [];
  const vendor = fields.vendor;

  if (clockSignal(title, productType, tags)) return hold('clock', 'clock');

  if (accessoryTitle(title)) return hold('accessory', 'accessory-title');
  if (strapTitle(title)) return hold('strap', 'strap-title');

  // A watch that mentions a bracelet, box and papers, or an integrated case
  // is still a watch, even when the shop filed it under Straps.
  if (watchShaped(title, text)) return { decision: 'watch' };

  const leaf = catalogueTypeLeaf(productType);
  if (leaf && ACCESSORY_TYPE.test(leaf)) return hold('accessory', 'accessory-type');
  if (leaf && STRAP_TYPE.test(leaf)) return hold('strap', 'strap-type');

  const vendorName = vendor ? fold(vendor) : '';
  if (
    vendorName === 'wis straps' &&
    /\b(?:straps?|bracelets?|bands?)\b/i.test(`${title}\n${text}`)
  ) {
    return hold('strap', 'wis-straps');
  }
  if (strapConstruction(title, text)) return hold('strap', 'strap-construction');

  const tagged = tagReason(tags, title);
  if (tagged) return hold(tagged, `tag-${tagged}`);

  return { decision: 'watch' };
}

export function fieldsFromSourceItem(item: SourceItem): CatalogueFields {
  return {
    title: item.title,
    text: item.text,
    productType: item.meta?.productType ?? null,
    tags: item.meta?.tags ?? [],
    vendor: item.meta?.vendor ?? null,
  };
}

export function holdLabel(reason: HoldReason): string {
  return `held: ${reason}`;
}
