import { toRpcArgs, type Filters } from '@/features/filters/types';

import type {
  CaseMaterial,
  Complication,
  DeckCard,
  Profile,
  SwipeDirection,
  WatchStyle,
  Winding,
} from './models';

/**
 * Demo mode runs the whole app against in-memory fixtures, with no Supabase at
 * all. It exists so the UI can be built and reviewed while the backend is
 * unavailable. Every read in `src/data` short-circuits here when it is on.
 *
 * Turn on with EXPO_PUBLIC_DEMO=1. Never enable it in a release build.
 */
export const isDemo = process.env.EXPO_PUBLIC_DEMO === '1';

export const DEMO_USER_ID = 'demo-user';

const DEMO_PROFILE: Profile = {
  id: DEMO_USER_ID,
  first_name: 'Demo',
  last_name: 'Collector',
  favorite_brands: ['rolex'],
  onboarded_at: '2026-01-01T00:00:00.000Z',
  // Demo mode is a deck to look at, and the dealer half needs a real shop row.
  account_type: 'buyer',
  avatar_url: null,
  bio: null,
  handle: null,
  created_at: '2026-01-01T00:00:00.000Z',
};

const DEALER = { id: 'demo-dealer', name: 'Vintage Vault', website: 'https://vintagevault.test' };

type Fixture = {
  brand: string;
  model: string;
  reference: string;
  year: number;
  caliber: string;
  winding: Winding;
  case_size_mm: number;
  case_material: CaseMaterial;
  style: WatchStyle;
  complications: Complication[];
  condition: string;
  price_cents: number;
  description: string;
};

const FIXTURES: Fixture[] = [
  {
    brand: 'Omega',
    model: 'Speedmaster Professional',
    reference: 'ST 145.022',
    year: 1972,
    caliber: 'Cal. 861 manual wind',
    winding: 'manual',
    case_size_mm: 42,
    case_material: 'steel',
    style: 'chronograph',
    complications: ['chronograph'],
    condition: 'Very good',
    price_cents: 1250000,
    description: 'Tritium dial with even patina. Recently serviced.',
  },
  {
    brand: 'Rolex',
    model: 'Datejust',
    reference: '1601',
    year: 1968,
    caliber: 'Cal. 1570 automatic',
    winding: 'automatic',
    case_size_mm: 36,
    case_material: 'steel',
    style: 'sports',
    complications: ['date'],
    condition: 'Good',
    price_cents: 785000,
    description: 'Silver pie-pan dial on a jubilee bracelet.',
  },
  {
    brand: 'Heuer',
    model: 'Autavia',
    reference: '2446',
    year: 1965,
    caliber: 'Valjoux 72 manual wind',
    winding: 'manual',
    case_size_mm: 39,
    case_material: 'steel',
    style: 'chronograph',
    complications: ['chronograph'],
    condition: 'Excellent',
    price_cents: 3400000,
    description: 'Second execution dial, screw-back case.',
  },
  {
    brand: 'Seiko',
    model: '6139 Pogue',
    reference: '6139-6002',
    year: 1976,
    caliber: 'Cal. 6139 automatic',
    winding: 'automatic',
    case_size_mm: 41,
    case_material: 'steel',
    style: 'chronograph',
    complications: ['chronograph', 'day_date'],
    condition: 'Fair',
    price_cents: 92000,
    description: 'Yellow dial, original bracelet, honest wear.',
  },
  {
    brand: 'Universal Genève',
    model: 'Polerouter',
    reference: '20217-4',
    year: 1959,
    caliber: 'Cal. 215 micro-rotor',
    winding: 'automatic',
    case_size_mm: 34.5,
    case_material: 'steel',
    style: 'dress',
    complications: [],
    condition: 'Very good',
    price_cents: 310000,
    description: 'Crosshair dial, later crown.',
  },
  {
    brand: 'Cartier',
    model: 'Tank Must',
    reference: 'Ref. 5057001',
    year: 1988,
    caliber: 'Quartz',
    winding: 'quartz',
    case_size_mm: 30,
    case_material: 'yellow_gold',
    style: 'dress',
    complications: [],
    condition: 'Excellent',
    price_cents: 420000,
    description: 'Vermeil case, original deployant.',
  },
];

const CARDS: DeckCard[] = FIXTURES.map((fixture, index) => ({
  id: `demo-${index}`,
  dealer_id: DEALER.id,
  imported_by: 'demo-importer',
  import_job_id: null,
  source_url: `${DEALER.website}/${index}`,
  brand: fixture.brand,
  model: fixture.model,
  reference: fixture.reference,
  year: fixture.year,
  caliber: fixture.caliber,
  winding: fixture.winding,
  case_size_mm: fixture.case_size_mm,
  case_material: fixture.case_material,
  dial_color: null,
  style: fixture.style,
  complications: fixture.complications,
  brand_key: fixture.brand.toLowerCase().replace(/[^a-z0-9]/g, ''),
  condition: fixture.condition,
  has_box: index % 2 === 0,
  has_papers: index % 3 === 0,
  price_cents: fixture.price_cents,
  currency: 'USD',
  description: fixture.description,
  status: 'active',
  // Demo mode is a deck to look at, and the deck never holds a sold watch.
  sold_at: null,
  availability_checked_at: null,
  edited_fields: [],
  created_at: new Date(Date.now() - index * 86_400_000).toISOString(),
  // Three, so the carousel has something to page through in demo mode.
  photos: [0, 1, 2].map((position) => {
    const url = `https://picsum.photos/seed/${encodeURIComponent(fixture.reference)}-${position}/900/1200`;
    return {
      id: `demo-photo-${index}-${position}`,
      listing_id: `demo-${index}`,
      url,
      source_url: url,
      storage_path: null,
      position,
    };
  }),
  dealer: DEALER,
}));

// Swipes live for the life of the process, so the deck and Saved stay in sync
// while you use the app. A reload starts over, which is what you want in a demo.
const swiped = new Map<string, SwipeDirection>();

/** Mirrors search_listings closely enough that filters behave the same offline. */
function matches(card: DeckCard, filters: Filters): boolean {
  const f = toRpcArgs(filters);
  const text = `${card.brand} ${card.model ?? ''} ${card.reference ?? ''}`.toLowerCase();

  if (f.p_query && !text.includes(f.p_query.toLowerCase())) return false;
  if (f.p_brands && !f.p_brands.includes(card.brand_key ?? '')) return false;
  if (f.p_dealers && !f.p_dealers.includes(card.dealer_id)) return false;
  if (f.p_styles && (!card.style || !f.p_styles.includes(card.style))) return false;
  if (f.p_materials && (!card.case_material || !f.p_materials.includes(card.case_material))) return false;
  if (f.p_windings && (!card.winding || !f.p_windings.includes(card.winding))) return false;
  if (f.p_complications && !f.p_complications.every((c) => card.complications.includes(c))) return false;
  if (f.p_price_min != null && (card.price_cents ?? -1) < f.p_price_min) return false;
  if (f.p_price_max != null && (card.price_cents ?? Infinity) > f.p_price_max) return false;
  if (f.p_size_min != null && Number(card.case_size_mm ?? -1) < f.p_size_min) return false;
  if (f.p_size_max != null && Number(card.case_size_mm ?? Infinity) > f.p_size_max) return false;
  if (f.p_year_min != null && (card.year ?? -1) < f.p_year_min) return false;
  if (f.p_year_max != null && (card.year ?? Infinity) > f.p_year_max) return false;

  return true;
}

export const demo = {
  deck: (filters?: Filters) =>
    CARDS.filter((card) => !swiped.has(card.id) && (!filters || matches(card, filters))),

  search: (filters: Filters) => CARDS.filter((card) => matches(card, filters)),

  recordSwipe: (listingId: string, direction: SwipeDirection) => {
    swiped.set(listingId, direction);
  },

  saved: () =>
    CARDS.filter((card) => swiped.get(card.id) === 'right').reverse(),

  unsave: (listingId: string) => {
    swiped.delete(listingId);
  },

  // Demo mode is for looking around, so it starts past onboarding.
  profile: () => DEMO_PROFILE,

  completeOnboarding: () => undefined,

  setAvatar: (url: string) => {
    DEMO_PROFILE.avatar_url = url;
  },

  passCount: () => [...swiped.values()].filter((direction) => direction === 'left').length,

  startOver: () => {
    for (const [listingId, direction] of swiped) {
      if (direction === 'left') swiped.delete(listingId);
    }
  },

  listing: (listingId: string) => CARDS.find((card) => card.id === listingId) ?? null,
};
