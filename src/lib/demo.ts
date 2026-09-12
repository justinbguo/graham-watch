import type { DeckCard, SwipeDirection } from './models';

/**
 * Demo mode runs the whole app against in-memory fixtures, with no Supabase at
 * all. It exists so the UI can be built and reviewed while the backend is
 * unavailable. Every read in `src/data` short-circuits here when it is on.
 *
 * Turn on with EXPO_PUBLIC_DEMO=1. Never enable it in a release build.
 */
export const isDemo = process.env.EXPO_PUBLIC_DEMO === '1';

export const DEMO_USER_ID = 'demo-user';

const DEALER = { id: 'demo-dealer', name: 'Vintage Vault', website: 'https://vintagevault.test' };

type Fixture = {
  brand: string;
  model: string;
  reference: string;
  year: number;
  movement: string;
  case_size_mm: number;
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
    movement: 'Cal. 861 manual wind',
    case_size_mm: 42,
    condition: 'Very good',
    price_cents: 1250000,
    description: 'Tritium dial with even patina. Recently serviced.',
  },
  {
    brand: 'Rolex',
    model: 'Datejust',
    reference: '1601',
    year: 1968,
    movement: 'Cal. 1570 automatic',
    case_size_mm: 36,
    condition: 'Good',
    price_cents: 785000,
    description: 'Silver pie-pan dial on a jubilee bracelet.',
  },
  {
    brand: 'Heuer',
    model: 'Autavia',
    reference: '2446',
    year: 1965,
    movement: 'Valjoux 72 manual wind',
    case_size_mm: 39,
    condition: 'Excellent',
    price_cents: 3400000,
    description: 'Second execution dial, screw-back case.',
  },
  {
    brand: 'Seiko',
    model: '6139 Pogue',
    reference: '6139-6002',
    year: 1976,
    movement: 'Cal. 6139 automatic',
    case_size_mm: 41,
    condition: 'Fair',
    price_cents: 92000,
    description: 'Yellow dial, original bracelet, honest wear.',
  },
  {
    brand: 'Universal Genève',
    model: 'Polerouter',
    reference: '20217-4',
    year: 1959,
    movement: 'Cal. 215 micro-rotor',
    case_size_mm: 34.5,
    condition: 'Very good',
    price_cents: 310000,
    description: 'Crosshair dial, later crown.',
  },
  {
    brand: 'Cartier',
    model: 'Tank Must',
    reference: 'Ref. 5057001',
    year: 1988,
    movement: 'Quartz',
    case_size_mm: 30,
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
  movement: fixture.movement,
  case_size_mm: fixture.case_size_mm,
  condition: fixture.condition,
  has_box: index % 2 === 0,
  has_papers: index % 3 === 0,
  price_cents: fixture.price_cents,
  currency: 'USD',
  description: fixture.description,
  status: 'active',
  created_at: new Date(Date.now() - index * 86_400_000).toISOString(),
  photos: [
    {
      id: `demo-photo-${index}`,
      listing_id: `demo-${index}`,
      url: `https://picsum.photos/seed/${encodeURIComponent(fixture.reference)}/900/1200`,
      source_url: `https://picsum.photos/seed/${encodeURIComponent(fixture.reference)}/900/1200`,
      storage_path: null,
      position: 0,
    },
  ],
  dealer: DEALER,
}));

// Swipes live for the life of the process, so the deck and Saved stay in sync
// while you use the app. A reload starts over, which is what you want in a demo.
const swiped = new Map<string, SwipeDirection>();

export const demo = {
  deck: () => CARDS.filter((card) => !swiped.has(card.id)),

  recordSwipe: (listingId: string, direction: SwipeDirection) => {
    swiped.set(listingId, direction);
  },

  saved: () =>
    CARDS.filter((card) => swiped.get(card.id) === 'right').reverse(),

  unsave: (listingId: string) => {
    swiped.delete(listingId);
  },

  listing: (listingId: string) => CARDS.find((card) => card.id === listingId) ?? null,
};
