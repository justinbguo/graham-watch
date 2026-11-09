import { Asset } from 'expo-asset';

import type { Database } from '@/lib/database';

import type { ExchangeAuthor, ExchangeComment, ExchangePost, ExchangeThread } from './exchange';

/** Stable ids so taps and votes can target fixtures without touching the database. */
export const SHOWCASE_POST_PREFIX = 'showcase:';

export function isExchangeShowcasePost(id: string) {
  return id.startsWith(SHOWCASE_POST_PREFIX);
}

// Bundled, not remote: the showcase photos are the real watches the sample posts describe.
// Asset.fromModule turns a require()'d image into a URI the Image component can load.
const SPEEDMASTER_PHOTO = Asset.fromModule(
  require('../../assets/showcase/omega-speedmaster.png')
).uri;
const EXPLORER_PHOTO = Asset.fromModule(
  require('../../assets/showcase/rolex-explorer-ii-polar.jpg')
).uri;

const authors = {
  sell: {
    id: 'showcase-author-maya',
    handle: 'maya_vintage',
    number: 2184,
    name: 'Maya K.',
    avatar_url: null,
  },
  buy: {
    id: 'showcase-author-jordan',
    handle: 'jordan_bb58',
    number: 903,
    name: 'Jordan T.',
    avatar_url: null,
  },
  trade: {
    id: 'showcase-author-sam',
    handle: 'sam_polar',
    number: 441,
    name: 'Sam R.',
    avatar_url: null,
  },
  random: {
    id: 'showcase-author-graham',
    handle: 'graham_mod',
    number: 1,
    name: 'Graham',
    avatar_url: null,
  },
} satisfies Record<string, ExchangeAuthor>;

type PostRow = Database['public']['Tables']['exchange_posts']['Row'];

function row(
  slug: 'sell' | 'buy' | 'trade' | 'random',
  input: Omit<PostRow, 'id' | 'author_id' | 'author_handle' | 'author_number' | 'created_at'>
): PostRow {
  const author = authors[slug];
  return {
    id: `${SHOWCASE_POST_PREFIX}${slug}`,
    author_id: author.id,
    author_handle: author.handle,
    author_number: author.number,
    created_at: `2026-09-01T12:${slug === 'sell' ? '10' : slug === 'buy' ? '20' : slug === 'trade' ? '30' : '40'}:00.000Z`,
    ...input,
  };
}

const POST_ROWS: PostRow[] = [
  row('sell', {
    intent: 'sell',
    title: 'Omega Speedmaster Professional 3590.50',
    price_cents: 420_000,
    currency: 'USD',
    body:
      'Hesalite, tritium dial with even patina. Full set: inner/outer boxes, warranty card, and recent service papers from an authorized center (2024). ' +
      'Runs within spec. Minor desk marks on clasp.\n\n' +
      'Asking $4,200 shipped CONUS. PayPal G&S (buyer covers fees) or wire. Will ship fully insured with signature.',
  }),
  row('buy', {
    intent: 'buy',
    title: 'Tudor Black Bay 58 blue on bracelet',
    price_cents: 320_000,
    currency: 'USD',
    body:
      'Looking for a BB58 blue on the OEM bracelet. Prefer light wear or better; open to a polish if the price is right. ' +
      'Budget up to $3,200 depending on condition and whether box/papers are included.\n\n' +
      'CONUS sellers preferred. Can meet locally in Chicago or pay for insured shipping.',
  }),
  row('trade', {
    intent: 'trade',
    title: 'Rolex Explorer II 16570 polar dial',
    price_cents: null,
    currency: 'USD',
    body:
      'WTT my 16570 polar (serial P-series, sharp case, bracelet fits a 7.25" wrist with one removed link). ' +
      'Looking to trade toward a Datejust 36 fluted jubilee — silver, white, or champagne dial.\n\n' +
      'Cash can balance either way through an agreed escrow or in-person exchange. Not interested in lowball offers.',
  }),
  row('random', {
    intent: 'random',
    title: 'What is your daily beater ceiling?',
    price_cents: null,
    currency: 'USD',
    body:
      'Curious how other people draw the line between a watch you baby and one you actually live in. ' +
      'Mine used to be $500; now it is somehow $2k and I still wear a Seiko on travel days.\n\n' +
      'Not looking to buy — just comparing notes on what feels reckless vs. reasonable.',
  }),
];

function authorFor(row: PostRow): ExchangeAuthor {
  return Object.values(authors).find((person) => person.id === row.author_id) ?? authors.random;
}

function feedPost(row: PostRow): ExchangePost {
  const author = authorFor(row);
  const cover =
    row.intent === 'sell'
      ? SPEEDMASTER_PHOTO
      : row.intent === 'trade'
        ? EXPLORER_PHOTO
        : null;
  return {
    id: row.id,
    intent: row.intent,
    title: row.title,
    price_cents: row.price_cents,
    currency: row.currency,
    body: row.body,
    created_at: row.created_at,
    author,
    comment_count: row.intent === 'sell' ? 2 : row.intent === 'buy' ? 1 : 0,
    vote_count: row.intent === 'sell' ? 14 : row.intent === 'buy' ? 6 : row.intent === 'trade' ? 3 : 22,
    my_vote: 0,
    cover_url: cover,
  };
}

const SAMPLE_COMMENTS: Record<string, ExchangeComment[]> = {
  [`${SHOWCASE_POST_PREFIX}sell`]: [
    {
      id: 'showcase-comment-sell-1',
      parent_id: null,
      body: 'Would you take $4,000 if I pick up locally in NYC this week?',
      created_at: '2026-09-01T14:22:00.000Z',
      author: authors.buy,
      vote_count: 2,
      my_vote: 0,
    },
    {
      id: 'showcase-comment-sell-2',
      parent_id: 'showcase-comment-sell-1',
      body: 'Could do $4,100 meetup in Manhattan if you are serious — cash.',
      created_at: '2026-09-01T15:01:00.000Z',
      author: authors.sell,
      vote_count: 0,
      my_vote: 0,
    },
  ],
  [`${SHOWCASE_POST_PREFIX}buy`]: [
    {
      id: 'showcase-comment-buy-1',
      parent_id: null,
      body: 'I have a BB58 blue, full set, light desk wear — DM if you want photos.',
      created_at: '2026-09-02T09:15:00.000Z',
      author: authors.trade,
      vote_count: 1,
      my_vote: 0,
    },
  ],
};

const THREADS: Record<string, ExchangeThread> = Object.fromEntries(
  POST_ROWS.map((postRow) => {
    const author = authorFor(postRow);
    const feed = feedPost(postRow);
    const photos =
      feed.cover_url
        ? [{ path: `showcase/${postRow.id}.jpg`, url: feed.cover_url }]
        : [];
    return [
      postRow.id,
      {
        post: postRow,
        author,
        comments: SAMPLE_COMMENTS[postRow.id] ?? [],
        photos,
        vote_count: feed.vote_count,
        my_vote: 0,
      } satisfies ExchangeThread,
    ];
  })
);

/** Example posts appended to every signed-in feed. */
export function exchangeShowcasePosts(): ExchangePost[] {
  return POST_ROWS.map((row) => feedPost(row));
}

export function exchangeShowcaseThread(postId: string): ExchangeThread | null {
  return THREADS[postId] ?? null;
}

export function exchangeShowcaseAuthor(userId: string): ExchangeAuthor | null {
  return Object.values(authors).find((author) => author.id === userId) ?? null;
}

export function exchangeShowcaseCollectorPosts(userId: string) {
  return POST_ROWS.filter((row) => row.author_id === userId).map((row) => {
    const feed = feedPost(row);
    return {
      id: feed.id,
      intent: feed.intent,
      title: feed.title,
      price_cents: feed.price_cents,
      currency: feed.currency,
      body: feed.body,
      cover_url: feed.cover_url,
    };
  });
}
