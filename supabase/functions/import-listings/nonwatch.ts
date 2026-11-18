import type { SourceItem } from './source.ts';

export const HOLD_REASONS = ['strap', 'accessory', 'clock', 'not_a_watch'] as const;

export type HoldReason = (typeof HOLD_REASONS)[number];

export type CatalogueFields = {
  title: string;
  text: string;
  productType: string | null;
  tags: string[];
  vendor: string | null;
  sourceUrl?: string;
};

export type CatalogueRule = {
  id: string;
  reason: HoldReason;
  /**
   * A switched-off rule is ignored. It must not stop the list: pocket-watch
   * rules sit after the pendant and stopwatch rules, and those two are off.
   * Returning "this is a watch" from an off rule published pocket watches
   * whose title also said pendant or lapel, while clocks (checked before
   * this list) and bracelets (checked after it) still held.
   */
  enabled: boolean;
  matches: (fields: CatalogueFields) => boolean;
};

export type CatalogueDecision =
  | { decision: 'watch' }
  | { decision: 'hold'; reason: HoldReason; rule: string };

const CLOCK_TYPE = /\bclocks?\b/i;
const ACCESSORY_TYPE =
  /\b(tools?|winders?|boxes|cases?|trays?|accessor\w*|pouches?|rolls?|cuff\s*links?)\b/i;
const STRAP_TYPE = /\b(straps?|bands?|bracelets?|buckles?|clasps?|natos?|two[\s-]?piece)\b/i;

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
  /\b(?:on|with|fitted with|attached to|comes with|including|having)\b(?:\s+\w+){0,6}\s+(?:an?\s+|the\s+)?(?:leather\s+|oyster\s+|jubilee\s+|president(?:ial)?\s+|integrated\s+)?(?:bracelets?|straps?|bands?)\b/i,
];

function watchShaped(title: string, text: string): boolean {
  const blob = `${title}\n${text}`;
  if (WATCH_SHAPED.some((pattern) => pattern.test(blob))) return true;
  return /\bbox(?:es)?\b/i.test(blob) && /\bpapers?\b/i.test(blob);
}

function mentionsClock(value: string): boolean {
  return CLOCK_TYPE.test(value.replace(/o['’]clock/gi, ' '));
}

function clockSignal(title: string, productType: string | null, tags: string[]): boolean {
  const leaf = catalogueTypeLeaf(productType);
  if (mentionsClock(title) || (leaf && mentionsClock(leaf))) return true;
  return tags.some((tag) => fold(tag) === 'clock' || fold(tag) === 'clocks');
}

function accessoryTitle(title: string): boolean {
  if (/\btrays?\b/i.test(title)) return true;
  if (/\bwinders?\b/i.test(title)) return true;
  if (/\btools?\b/i.test(title) && !/\bwatches?\b/i.test(title)) return true;
  if (/\bwatch\s+box(?:es)?\b/i.test(title) && !/\bpapers?\b/i.test(title)) return true;
  // Apparel sold next to the watches: "Theo & Harris Cap", "GMT Hands Shirt".
  // A bare "Cap" is a strap end (product type Nato), so that title stays a strap.
  // "capsule" and "captain" are not the word cap.
  if (/\bgift\s+cards?\b/i.test(title)) return true;
  if (/\b(?:t-?shirts?|shirts?)\b/i.test(title)) return true;
  if (!/^\s*caps?\s*$/i.test(title) && /\bcaps?\b/i.test(title)) return true;
  return false;
}

/**
 * Keystone files jewelry under product type Watches and puts `(Objet)` in the
 * title.
 */
function objetAccessory(title: string): boolean {
  if (!/\(\s*objet\s*\)/i.test(title)) return false;
  return !/\bwatch(?:es)?\b/i.test(title);
}

function watchNamedInTitle(title: string): boolean {
  return /\bwatch(?:es)?\b/i.test(title) && !/\bwatch\s+straps?\b/i.test(title);
}

function dialNamedInTitle(title: string): boolean {
  return /\bdial\b/i.test(title);
}

function subNamedInTitle(title: string): boolean {
  return /\bsub\b/i.test(title);
}

function strapTitle(title: string): boolean {
  if (/\bbuckles?\b/i.test(title) && title.length <= 40 && !hasYearOrReference(title)) return true;
  if (watchNamedInTitle(title) || dialNamedInTitle(title) || subNamedInTitle(title)) return false;
  if (/\bstraps?\b/i.test(title)) return !strapWordDescribesWatch(title);
  if (/\b(?:oyster|jubilee|president(?:ial)?)\b.{0,24}\bbracelets?\b/i.test(title)) return true;
  if (/\bbracelets?\b/i.test(title) && /\b\d+\s*mm\b/i.test(title)) return true;
  if (/\bheavy\s+bracelets?\b/i.test(title)) return true;
  if (/\bbark\s+finish\s+bracelets?\b/i.test(title)) return true;
  if (/\b(?:rose|white|yellow)\s+gold\s+bracelets?\s*$/i.test(title)) return true;
  if (!/\bon\b/i.test(title) && /\b(?:stretch\s+rivets?|end\s+links?)\b/i.test(title)) return true;
  return false;
}

function strapWordDescribesWatch(title: string): boolean {
  if (/\b(?:on|original|included)\s+straps?\b/i.test(title)) return true;
  if (/\bwith\b(?:\s+\w+){0,5}\s+straps?\b/i.test(title)) return true;
  const color = title.match(
    /\b(?:red|green|blue|brown|grey|gray|black|navy|white|tan|pink|orange|yellow)\s+straps?\b/i,
  );
  if (!color || color.index == null) return false;
  const before = title.slice(0, color.index).trim().split(/\s+/).filter(Boolean);
  return before.length >= 2;
}

function pocketTitle(title: string): boolean {
  return /\bpocket\s*watch/i.test(title) || /\bpocketwatch/i.test(title);
}

function pocketPath(sourceUrl: string | undefined): boolean {
  if (!sourceUrl) return false;
  let path = sourceUrl;
  try {
    path = new URL(sourceUrl).pathname;
  } catch {
    path = sourceUrl;
  }
  const folded = path.toLowerCase();
  return (
    folded.includes('/pocket-watches') ||
    folded.includes('pocket-watch') ||
    folded.includes('pocketwatch')
  );
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

export const CATALOGUE_RULES: readonly CatalogueRule[] = [
  {
    id: 'pendant-lapel-brooch',
    reason: 'not_a_watch',
    enabled: false,
    matches: ({ title }) =>
      /\b(?:pendant|lapel|brooch|sautoir)\b/i.test(title) || /\bcufflink\s+watch\b/i.test(title),
  },
  {
    id: 'handheld-stopwatch',
    reason: 'not_a_watch',
    enabled: false,
    matches: ({ title }) => /\bstop\s*-?\s*watch(?!ing)/i.test(title) && !pocketTitle(title),
  },
  {
    id: 'money-clip',
    reason: 'not_a_watch',
    enabled: true,
    matches: ({ title }) => /\bmoney\s*-?\s*clips?\b/i.test(title),
  },
  {
    id: 'empty-case',
    reason: 'not_a_watch',
    enabled: true,
    matches: ({ title }) =>
      /\bcase\s+for\s+key\b/i.test(title) || /\bpocket\s*watch\s+cases?\b/i.test(title),
  },
  {
    id: 'movement-only',
    reason: 'not_a_watch',
    enabled: true,
    matches: ({ title, text }) => /\bmovement\s+only\b/i.test(`${title}\n${text}`),
  },
  {
    id: 'pocket-type',
    reason: 'not_a_watch',
    enabled: true,
    matches: ({ productType }) =>
      Boolean(productType && /\bpocket\s*watch/i.test(productType)),
  },
  {
    id: 'pocket-url',
    reason: 'not_a_watch',
    enabled: true,
    matches: ({ sourceUrl }) => pocketPath(sourceUrl),
  },
  {
    id: 'pocket-title',
    reason: 'not_a_watch',
    enabled: true,
    matches: ({ title }) => pocketTitle(title),
  },
];

function holdFromRules(fields: CatalogueFields): CatalogueDecision | null {
  for (const rule of CATALOGUE_RULES) {
    if (!rule.enabled) continue;
    if (!rule.matches(fields)) continue;
    return hold(rule.reason, rule.id);
  }
  return null;
}

function holdFromTitle(title: string): CatalogueDecision | null {
  // A paper ad for a watch is not the watch, even when the title says both
  // ("1970 Grand Seiko … Dress Watch Advertisement").
  if (/\badvertisements?\b/i.test(title)) return hold('not_a_watch', 'advertisement-title');
  if (objetAccessory(title)) return hold('accessory', 'objet-title');
  if (accessoryTitle(title)) return hold('accessory', 'accessory-title');
  if (strapTitle(title)) return hold('strap', 'strap-title');
  return null;
}

function holdFromTypeLeaf(productType: string | null): CatalogueDecision | null {
  const leaf = catalogueTypeLeaf(productType);
  if (!leaf) return null;
  // "Watches and Accessories" is a shop's whole shelf, not a claim that this
  // row is a box or a tool. A leaf that also names a strap still holds.
  if (/\bwatches?\b/i.test(leaf) && !STRAP_TYPE.test(leaf)) return null;
  if (ACCESSORY_TYPE.test(leaf)) return hold('accessory', 'accessory-type');
  if (STRAP_TYPE.test(leaf)) return hold('strap', 'strap-type');
  return null;
}

export function classifyCatalogueItem(fields: CatalogueFields): CatalogueDecision {
  const title = fields.title ?? '';
  const text = fields.text ?? '';
  const productType = fields.productType;
  const tags = fields.tags ?? [];
  const vendor = fields.vendor;

  if (clockSignal(title, productType, tags)) return hold('clock', 'clock');

  const ruled = holdFromRules(fields);
  if (ruled) return ruled;

  const titled = holdFromTitle(title);
  if (titled) return titled;
  if (watchShaped(title, text)) return { decision: 'watch' };
  const typed = holdFromTypeLeaf(productType);
  if (typed) return typed;

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
    sourceUrl: item.sourceUrl,
  };
}

export function holdLabel(reason: HoldReason): string {
  return `held: ${reason}`;
}
