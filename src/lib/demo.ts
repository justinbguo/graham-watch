import { matchesListing } from '@/features/filters/match';
import type { Filters } from '@/features/filters/types';
import type { PersonName } from '@/lib/personName';

import type {
  CaseMaterial,
  Complication,
  DealerIdentity,
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
 * Turn on with EXPO_PUBLIC_DEMO=1. EAS `preview` and `production` force it off
 * and talk to the hosted project. Never set it on a store build.
 */
export const isDemo = process.env.EXPO_PUBLIC_DEMO === '1';

export const DEMO_USER_ID = 'demo-user';

const DEMO_SEALED_AT = new Date().toISOString();

const DEMO_PROFILE: Profile = {
  id: DEMO_USER_ID,
  first_name: 'Demo',
  last_name: 'Collector',
  favorite_brands: ['rolex'],
  onboarded_at: '2026-01-01T00:00:00.000Z',
  // Demo mode is a deck to look at, and the dealer half needs a real shop row.
  account_type: 'buyer',
  date_of_birth: '1990-01-01',
  collecting_years: 'one_to_five',
  collection_size: 'one_to_three',
  hunting_for: ['sports'],
  notify_new_arrivals: false,
  notify_saved_watches: false,
  notifications_enabled: false,
  search_pain_points: ['verifying_originality', 'finding_fair_prices'],
  avatar_url: null,
  bio: null,
  collector_number: 1,
  handle: null,
  created_at: '2026-01-01T00:00:00.000Z',
};

const DEALER = {
  id: 'demo-dealer',
  name: 'Vintage Vault',
  website: 'https://vintagevault.test',
  description: 'Twenty years of honest vintage. Every watch serviced, photographed and described in house.',
  instagram: 'vintagevault',
  // No mark: the demo answers from fixtures and must not reach the network.
  logo_url: null,
};

const HARBOUR = {
  id: 'demo-dealer-harbour',
  name: 'Harbour Watch Co.',
  website: 'https://harbourwatch.test',
  description: 'A small shop of sports watches, serviced in house.',
  instagram: 'harbourwatch',
  logo_url: null,
};

// No card points here. The header asks by id, and the first listing would miss it.
const UNLISTED: DealerIdentity = {
  id: 'demo-dealer-unlisted',
  name: 'Quiet Bench',
  website: 'https://quietbench.test',
  description: 'A bench with no watches in the catalogue yet.',
  instagram: 'quietbench',
  logo_url: null,
};

/** Six fixtures across two shops, so the Buy filter has more than one dealer. */
const SHOPS = [DEALER, DEALER, DEALER, HARBOUR, HARBOUR, DEALER];

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

const CARDS: DeckCard[] = FIXTURES.map((fixture, index) => {
  const shop = SHOPS[index] ?? DEALER;
  return {
    id: `demo-${index}`,
    dealer_id: shop.id,
    imported_by: 'demo-importer',
    import_job_id: null,
    source_url: `${shop.website}/${index}`,
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
    cost_cents: null,
    currency: 'USD',
    description: fixture.description,
    status: 'active',
    // Demo mode is a deck to look at, and the deck never holds a sold watch.
    sold_at: null,
    sold_source: null,
    availability_checked_at: null,
    edited_fields: [],
    created_at: new Date(Date.now() - index * 86_400_000).toISOString(),
    photo_count: 3,
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
    dealer: shop,
  };
});

// Swipes live for the life of the process, so the deck and the wishlist stay in sync
// while you use the app. A reload starts over, which is what you want in a demo.
const swiped = new Map<string, SwipeDirection>();
const followed = new Set<string>();

/**
 * The mail draft the `inquiry-draft` function would return, composed offline.
 *
 * Wording is duplicated from that function rather than shared: it runs on Deno
 * in `supabase/functions` and nothing there is importable from the app bundle.
 * Change the wording in one place and change it in the other.
 */
export function demoMailDraft(card: DeckCard, message: string) {
  const name = [DEMO_PROFILE.first_name, DEMO_PROFILE.last_name].filter(Boolean).join(' ');
  const named = [card.brand, card.model].filter(Boolean).join(' ') || 'a watch';
  const watch = card.year ? `${card.year} ${named}` : named;
  const subject = card.reference ? `${watch} (ref. ${card.reference})` : watch;
  const price =
    card.price_cents === null
      ? 'price on request'
      : new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: card.currency ?? 'USD',
          maximumFractionDigits: 0,
        }).format(card.price_cents / 100);

  const shop = card.dealer ?? DEALER;
  return {
    to: `hello@${new URL(shop.website ?? DEALER.website).hostname}`,
    subject: `Inquiry: ${subject}`,
    body: [
      `Hi ${shop.name},`,
      '',
      `My name is ${name}. I'm interested in the ${subject} you have listed at ${price} — is it still available?`,
      ...(message.trim() ? ['', message.trim()] : []),
      '',
      `Listing: ${card.source_url}`,
      '',
      'Thanks,',
      name,
    ].join('\n'),
  };
}

export const demo = {
  /** Every fixture, including ones already swiped. Facets count the catalogue. */
  catalogue: () => CARDS,

  deck: (filters?: Filters) =>
    CARDS.filter((card) => !swiped.has(card.id) && (!filters || matchesListing(card, filters))),

  search: (filters: Filters) => CARDS.filter((card) => matchesListing(card, filters)),

  counts: (filters: Filters) => ({
    matched: CARDS.filter((card) => !swiped.has(card.id) && matchesListing(card, filters)).length,
    total: CARDS.length,
  }),

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

  setName: (name: PersonName) => {
    DEMO_PROFILE.first_name = name.first;
    DEMO_PROFILE.last_name = name.last;
  },

  passCount: () => [...swiped.values()].filter((direction) => direction === 'left').length,

  startOver: () => {
    for (const [listingId, direction] of swiped) {
      if (direction === 'left') swiped.delete(listingId);
    }
  },

  listing: (listingId: string) => CARDS.find((card) => card.id === listingId) ?? null,

  dealer: (dealerId: string): DealerIdentity | null =>
    CARDS.find((card) => card.dealer?.id === dealerId)?.dealer ??
    (dealerId === UNLISTED.id ? UNLISTED : null),

  /** The three newest fixtures, as if last night's refresh published them. */
  newBatch: () => ({
    id: 'demo-batch',
    sealedAt: DEMO_SEALED_AT,
    listingIds: CARDS.slice(0, 3).map((card) => card.id),
  }),

  listings: (ids: readonly string[]) =>
    ids.flatMap((id) => CARDS.filter((card) => card.id === id)),

  follows: (): { id: string; name: string; logo_url: string | null }[] =>
    followed.has(DEALER.id)
      ? [{ id: DEALER.id, name: DEALER.name, logo_url: DEALER.logo_url }]
      : [],

  directory: (): { id: string; name: string; logo_url: string | null }[] => [
    { id: HARBOUR.id, name: HARBOUR.name, logo_url: HARBOUR.logo_url },
    { id: UNLISTED.id, name: UNLISTED.name, logo_url: UNLISTED.logo_url },
    { id: DEALER.id, name: DEALER.name, logo_url: DEALER.logo_url },
  ],

  follow: (dealerId: string) => {
    followed.add(dealerId);
  },

  unfollow: (dealerId: string) => {
    followed.delete(dealerId);
  },
};
