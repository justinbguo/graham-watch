/**
 * Who gets a drop, and which watches are in it.
 *
 * Pure on purpose: the edge function loads rows and this decides. The rules:
 *
 * * A watch counts when it was created after the follow, is still for sale,
 *   was created within DROP_MAX_AGE_DAYS, and the shop is approved.
 *   Following a shop does not announce its catalogue, and a first push does
 *   not dump a year of inventory. The same window is public.drop_max_age()
 *   in the drops migration, which the Profile count uses.
 * * A watch already stored on a pending or sent notification is not sent again.
 *   A failed send does not count: those watches are eligible the next day.
 * * One notification per buyer per UTC day, whatever shops listed overnight.
 * * No push token, no row. The in-app count does not need one.
 */

export type DropFollow = {
  userId: string;
  dealerId: string;
  dealerName: string;
  followedAt: string;
  permission: string;
};

export type DropListing = {
  id: string;
  dealerId: string;
  createdAt: string;
  status: string;
  soldAt: string | null;
};

export type DropNotice = {
  userId: string;
  /** UTC calendar day, YYYY-MM-DD. */
  notifiedOn: string;
  status: string;
  listingIds: string[];
};

export type DropToken = {
  userId: string;
  token: string;
};

export type DropDealerTally = {
  id: string;
  name: string;
  count: number;
};

export type DropPlan = {
  userId: string;
  listingIds: string[];
  dealerIds: string[];
  dealers: DropDealerTally[];
  title: string;
  body: string;
  destination: 'dealer' | 'drops';
  dealerId: string | null;
  /** created_at of the newest watch in this push. */
  notifiedThrough: string;
};

const COVERS = new Set(['pending', 'sent']);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A listing older than this is not a drop, even when the follow is older and
 * the buyer has never been notified. Inclusive: a watch created at this exact
 * instant still counts. public.drop_max_age() is this many days.
 */
export const DROP_MAX_AGE_DAYS = 14;

/** Start of the drop window. Listings created at this millisecond are included. */
export function dropCutoff(now: Date): number {
  return now.getTime() - DROP_MAX_AGE_DAYS * MS_PER_DAY;
}

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function dropCopy(dealers: DropDealerTally[]): {
  title: string;
  body: string;
  destination: 'dealer' | 'drops';
  dealerId: string | null;
} {
  const watches = dealers.reduce((sum, dealer) => sum + dealer.count, 0);
  const watchWord = watches === 1 ? 'watch' : 'watches';
  const title = 'New watches';
  if (dealers.length === 1) {
    const dealer = dealers[0]!;
    return {
      title,
      body: `${watches} new ${watchWord} from ${dealer.name}`,
      destination: 'dealer',
      dealerId: dealer.id,
    };
  }
  return {
    title,
    body: `${watches} new ${watchWord} from ${dealers.length} dealers you follow`,
    destination: 'drops',
    dealerId: null,
  };
}

function time(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export type DropSkipCounts = {
  /** Approved follow, and no device registered. */
  noToken: number;
  /** Subset of noToken that also had at least one new watch. */
  noTokenWithListings: number;
  /** A row already exists for this UTC day, so the unique key would refuse another. */
  alreadyToday: number;
  /** Token and an approved follow, but nothing new in the window. */
  nothingNew: number;
  /** Every follow is a shop that is not approved, or the follow time does not parse. */
  noApprovedFollow: number;
};

export type DropReport = {
  plans: DropPlan[];
  skipped: DropSkipCounts;
};

const EMPTY_SKIPS = (): DropSkipCounts => ({
  noToken: 0,
  noTokenWithListings: 0,
  alreadyToday: 0,
  nothingNew: 0,
  noApprovedFollow: 0,
});

export function selectDrops(input: {
  now: Date;
  follows: DropFollow[];
  listings: DropListing[];
  notices: DropNotice[];
  tokens: DropToken[];
}): DropPlan[] {
  return reportDrops(input).plans;
}

/**
 * The same decision as selectDrops, plus why each follower was left out.
 * The nightly log prints the counts. A zero plan with noTokenWithListings
 * is a follower who has new watches and no phone, which is not an error.
 */
export function reportDrops(input: {
  now: Date;
  follows: DropFollow[];
  listings: DropListing[];
  notices: DropNotice[];
  tokens: DropToken[];
}): DropReport {
  const day = utcDay(input.now);
  const skipped = EMPTY_SKIPS();

  const tokensByUser = new Map<string, string[]>();
  for (const row of input.tokens) {
    const token = row.token.trim();
    if (!token) continue;
    const list = tokensByUser.get(row.userId) ?? [];
    if (!list.includes(token)) list.push(token);
    tokensByUser.set(row.userId, list);
  }

  const noticedToday = new Set<string>();
  const covered = new Map<string, Set<string>>();
  for (const notice of input.notices) {
    const on = notice.notifiedOn.slice(0, 10);
    if (on === day) noticedToday.add(notice.userId);
    if (!COVERS.has(notice.status)) continue;
    const ids = covered.get(notice.userId) ?? new Set<string>();
    for (const id of notice.listingIds) ids.add(id);
    covered.set(notice.userId, ids);
  }

  // Earliest follow wins if the same pair is passed twice. A later follow
  // would hide watches listed in between.
  const followByUser = new Map<string, Map<string, { at: number; name: string }>>();
  const seenFollowers = new Set<string>();
  for (const follow of input.follows) {
    seenFollowers.add(follow.userId);
    if (follow.permission !== 'approved') continue;
    const at = time(follow.followedAt);
    if (Number.isNaN(at)) continue;
    const shops = followByUser.get(follow.userId) ?? new Map();
    const existing = shops.get(follow.dealerId);
    if (!existing || at < existing.at) {
      shops.set(follow.dealerId, { at, name: follow.dealerName });
    }
    followByUser.set(follow.userId, shops);
  }
  for (const userId of seenFollowers) {
    if (!followByUser.has(userId)) skipped.noApprovedFollow += 1;
  }

  const listingsByDealer = new Map<string, DropListing[]>();
  const seenListing = new Set<string>();
  for (const listing of input.listings) {
    if (seenListing.has(listing.id)) continue;
    if (listing.status !== 'active' || listing.soldAt) continue;
    if (Number.isNaN(time(listing.createdAt))) continue;
    seenListing.add(listing.id);
    const list = listingsByDealer.get(listing.dealerId) ?? [];
    list.push(listing);
    listingsByDealer.set(listing.dealerId, list);
  }

  const plans: DropPlan[] = [];
  const cutoff = dropCutoff(input.now);
  const userIds = [...followByUser.keys()].sort();
  for (const userId of userIds) {
    const shops = followByUser.get(userId)!;
    const already = covered.get(userId) ?? new Set<string>();
    const chosen: DropListing[] = [];
    for (const [dealerId, follow] of shops) {
      for (const listing of listingsByDealer.get(dealerId) ?? []) {
        if (already.has(listing.id)) continue;
        const created = time(listing.createdAt);
        if (created < cutoff) continue;
        if (created <= follow.at) continue;
        chosen.push(listing);
      }
    }
    if (noticedToday.has(userId)) {
      skipped.alreadyToday += 1;
      continue;
    }
    if (!tokensByUser.has(userId)) {
      skipped.noToken += 1;
      if (chosen.length > 0) skipped.noTokenWithListings += 1;
      continue;
    }
    if (chosen.length === 0) {
      skipped.nothingNew += 1;
      continue;
    }

    chosen.sort((a, b) => {
      const delta = time(b.createdAt) - time(a.createdAt);
      if (delta !== 0) return delta;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    const tallies = new Map<string, DropDealerTally>();
    for (const listing of chosen) {
      const name = shops.get(listing.dealerId)?.name ?? 'A dealer';
      const tally = tallies.get(listing.dealerId) ?? { id: listing.dealerId, name, count: 0 };
      tally.count += 1;
      tallies.set(listing.dealerId, tally);
    }
    const dealers = [...tallies.values()].sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1));
    const copy = dropCopy(dealers);
    plans.push({
      userId,
      listingIds: chosen.map((listing) => listing.id),
      dealerIds: dealers.map((dealer) => dealer.id),
      dealers,
      title: copy.title,
      body: copy.body,
      destination: copy.destination,
      dealerId: copy.dealerId,
      notifiedThrough: chosen[0]!.createdAt,
    });
  }

  return { plans, skipped };
}
