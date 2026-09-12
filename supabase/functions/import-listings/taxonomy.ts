/**
 * The vocabulary the extractor is held to. These are passed to OpenAI as JSON
 * schema enums, which means a value outside the list is not something the model
 * can return — it is rejected by the API, not corrected by us afterwards.
 *
 * Every value here must exist in the matching Postgres enum. Adding one is two
 * edits: this file and a migration.
 */

export const WINDINGS = ['manual', 'automatic', 'quartz'] as const;

export const CASE_MATERIALS = [
  'steel',
  'yellow_gold',
  'rose_gold',
  'white_gold',
  'platinum',
  'two_tone',
  'titanium',
  'bronze',
  'silver',
  'other',
] as const;

export const DIAL_COLORS = [
  'black',
  'white',
  'silver',
  'champagne',
  'gilt',
  'blue',
  'green',
  'grey',
  'salmon',
  'brown',
  'cream',
  'other',
] as const;

export const STYLES = [
  'dress',
  'sports',
  'diver',
  'chronograph',
  'pilot',
  'field',
  'racing',
  'gmt',
  'jewellery',
  'pocket',
  'other',
] as const;

export const COMPLICATIONS = [
  'chronograph',
  'date',
  'day_date',
  'triple_calendar',
  'annual_calendar',
  'perpetual_calendar',
  'moonphase',
  'gmt',
  'world_time',
  'alarm',
  'power_reserve',
  'tourbillon',
  'minute_repeater',
  'jump_hour',
  'skeleton',
] as const;

/**
 * Dealers spell one brand several ways. Left as printed, "Vacheron & Constantin"
 * and "Vacheron Constantin" are two brands in a filter list.
 */
const ALIASES: Record<string, string> = {
  vacheronconstantin: 'Vacheron Constantin',
  vacheronandconstantin: 'Vacheron Constantin',
  vc: 'Vacheron Constantin',
  jaegerlecoultre: 'Jaeger-LeCoultre',
  jaeger: 'Jaeger-LeCoultre',
  jlc: 'Jaeger-LeCoultre',
  patek: 'Patek Philippe',
  patekphilippe: 'Patek Philippe',
  audemarspiguet: 'Audemars Piguet',
  ap: 'Audemars Piguet',
  alangesohne: 'A. Lange & Söhne',
  alangeandsohne: 'A. Lange & Söhne',
  lange: 'A. Lange & Söhne',
  iwc: 'IWC',
  iwcschaffhausen: 'IWC',
  girardperregaux: 'Girard-Perregaux',
  ulyssenardin: 'Ulysse Nardin',
  universalgeneve: 'Universal Genève',
  omega: 'Omega',
  rolex: 'Rolex',
  tudor: 'Tudor',
  cartier: 'Cartier',
  breguet: 'Breguet',
  breitling: 'Breitling',
  heuer: 'Heuer',
  tagheuer: 'TAG Heuer',
  longines: 'Longines',
  zenith: 'Zenith',
  movado: 'Movado',
  gallet: 'Gallet',
  gubelin: 'Gübelin',
  boucheron: 'Boucheron',
  chopard: 'Chopard',
  piaget: 'Piaget',
  blancpain: 'Blancpain',
  seiko: 'Seiko',
  grandseiko: 'Grand Seiko',
};

/** Lowercase, letters and digits only. "A. Lange & Söhne" and "A Lange Sohne" agree. */
export function brandKey(brand: string): string {
  return brand
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** The brand as it should be displayed, and the key everything filters on. */
export function canonicalBrand(brand: string): { brand: string; brand_key: string } {
  const trimmed = brand.trim().replace(/\s+/g, ' ');
  const key = brandKey(trimmed);
  const canonical = ALIASES[key];

  return canonical
    ? { brand: canonical, brand_key: brandKey(canonical) }
    : { brand: trimmed, brand_key: key };
}
