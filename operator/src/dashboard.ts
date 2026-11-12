/**
 * The Users tab reads one JSON document from `operator_dashboard`. This file
 * is the boundary: a missing key becomes an empty chart instead of a crash,
 * and the labels are the words on the screen.
 */

export type CountPoint = { label: string; count: number };

export type Rollup = { value: string; count: number };

export type Dashboard = {
  totals: {
    users: number;
    onboarded: number;
    onboarding_rate: number;
    buyers: number;
    dealers: number;
  };
  signupsByDay: CountPoint[];
  signupsByWeek: CountPoint[];
  activity: {
    dau: number;
    wau: number;
    dauSignins: number;
    wauSignins: number;
    dauSwipers: number;
    wauSwipers: number;
    swipesByDay: CountPoint[];
  };
  onboarding: {
    favoriteBrands: Rollup[];
    huntingFor: Rollup[];
    collectionSize: Rollup[];
    collectingYears: Rollup[];
    searchPainPoints: Rollup[];
  };
  swipes: {
    swipes: number;
    rightSwipes: number;
    rightRate: number;
    usersWhoSwiped: number;
    perUser: number;
  };
  topSavedListings: { listingId: string; brand: string; model: string | null; dealerName: string; saves: number }[];
  topSavedDealers: { dealerId: string; name: string; saves: number }[];
  follows: { total: number; dealers: { dealerId: string; name: string; followers: number }[] };
  funnel: {
    inquiries: number;
    conversations: number;
    messages: number;
    feeCents: number;
    deals: { status: string; count: number; feeCents: number }[];
  };
  dealerResponse: {
    dealerId: string;
    name: string;
    threads: number;
    answered: number;
    responseRate: number;
    medianResponseSeconds: number | null;
  }[];
};

const ANSWERS: Record<string, string> = {
  not_yet: 'Not yet',
  under_a_year: 'Under a year',
  one_to_five: '1–5 years',
  five_to_ten: '5–10 years',
  over_ten: 'Over 10 years',
  none: 'None',
  one: '1',
  one_to_three: '1–3',
  two_to_three: '2–3',
  four_to_six: '4–6',
  four_to_ten: '4–10',
  seven_to_ten: '7–10',
  eleven_to_twenty: '11–20',
  eleven_plus: '11+',
  twenty_one_plus: '21+',
  dress: 'Dress',
  sports: 'Sports',
  tool: 'Tool',
  anything: 'Anything',
  trusting_sellers: 'Trusting sellers',
  verifying_originality: 'Verifying originality',
  judging_condition: 'Judging condition',
  finding_fair_prices: 'Finding fair prices',
  finding_specific_watches: 'Finding a specific watch',
  understanding_service_history: 'Service history',
  buying_online: 'Buying online',
  buyer: 'Buyer',
  dealer: 'Dealer',
};

export function labelAnswer(value: string | null): string {
  if (!value) return '—';
  return ANSWERS[value] ?? value.replaceAll('_', ' ');
}

export function formatPercent(rate: number): string {
  if (!Number.isFinite(rate)) return '—';
  return `${Math.round(rate * 100)}%`;
}

export function formatFee(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format((cents || 0) / 100);
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const rounded = Math.round(seconds);
  if (rounded < 60) return `${rounded}s`;
  const minutes = Math.round(rounded / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function barShare(count: number, max: number): number {
  if (max <= 0 || count <= 0) return 0;
  return Math.min(100, (count / max) * 100);
}

export function parseDashboard(value: unknown): Dashboard {
  const row = record(value);
  const totals = record(row.totals);
  const activity = record(row.activity);
  const onboarding = record(row.onboarding);
  const swipes = record(row.swipes);
  const follows = record(row.follows);
  const funnel = record(row.funnel);

  return {
    totals: {
      users: num(totals.users),
      onboarded: num(totals.onboarded),
      onboarding_rate: num(totals.onboarding_rate),
      buyers: num(totals.buyers),
      dealers: num(totals.dealers),
    },
    signupsByDay: points(row.signups_by_day, 'day'),
    signupsByWeek: points(row.signups_by_week, 'week'),
    activity: {
      dau: num(activity.dau),
      wau: num(activity.wau),
      dauSignins: num(activity.dau_signins),
      wauSignins: num(activity.wau_signins),
      dauSwipers: num(activity.dau_swipers),
      wauSwipers: num(activity.wau_swipers),
      swipesByDay: points(activity.swipes_by_day, 'day', 'swipes'),
    },
    onboarding: {
      favoriteBrands: rollups(onboarding.favorite_brands),
      huntingFor: rollups(onboarding.hunting_for),
      collectionSize: rollups(onboarding.collection_size),
      collectingYears: rollups(onboarding.collecting_years),
      searchPainPoints: rollups(onboarding.search_pain_points),
    },
    swipes: {
      swipes: num(swipes.swipes),
      rightSwipes: num(swipes.right_swipes),
      rightRate: num(swipes.right_rate),
      usersWhoSwiped: num(swipes.users_who_swiped),
      perUser: num(swipes.per_user),
    },
    topSavedListings: array(row.top_saved_listings).map((item) => {
      const listing = record(item);
      return {
        listingId: str(listing.listing_id),
        brand: str(listing.brand),
        model: listing.model == null ? null : str(listing.model),
        dealerName: str(listing.dealer_name),
        saves: num(listing.saves),
      };
    }),
    topSavedDealers: array(row.top_saved_dealers).map((item) => {
      const dealer = record(item);
      return { dealerId: str(dealer.dealer_id), name: str(dealer.name), saves: num(dealer.saves) };
    }),
    follows: {
      total: num(follows.total),
      dealers: array(follows.dealers).map((item) => {
        const dealer = record(item);
        return {
          dealerId: str(dealer.dealer_id),
          name: str(dealer.name),
          followers: num(dealer.followers),
        };
      }),
    },
    funnel: {
      inquiries: num(funnel.inquiries),
      conversations: num(funnel.conversations),
      messages: num(funnel.messages),
      feeCents: num(funnel.fee_cents),
      deals: array(funnel.deals).map((item) => {
        const deal = record(item);
        return { status: str(deal.status), count: num(deal.count), feeCents: num(deal.fee_cents) };
      }),
    },
    dealerResponse: array(row.dealer_response).map((item) => {
      const dealer = record(item);
      return {
        dealerId: str(dealer.dealer_id),
        name: str(dealer.name),
        threads: num(dealer.threads),
        answered: num(dealer.answered),
        responseRate: num(dealer.response_rate),
        medianResponseSeconds:
          dealer.median_response_seconds == null ? null : num(dealer.median_response_seconds),
      };
    }),
  };
}

function points(value: unknown, labelKey: string, countKey = 'count'): CountPoint[] {
  return array(value).map((item) => {
    const row = record(item);
    return { label: str(row[labelKey]), count: num(row[countKey]) };
  });
}

function rollups(value: unknown): Rollup[] {
  return array(value)
    .map((item) => {
      const row = record(item);
      return { value: str(row.value), count: num(row.count) };
    })
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function num(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value: unknown): string {
  return value == null ? '' : String(value);
}
