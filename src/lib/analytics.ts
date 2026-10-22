import { Platform } from 'react-native';

import { isDemo } from './demo';
import { secureStorage } from './secureStorage';

/**
 * Product analytics for the buyer funnel. PostHog's capture API is a POST,
 * so this stays out of the native binary: web (Vercel) and Expo Go load the
 * same file, and a missing key makes every call return before the network.
 *
 * The anon key ships in the app. PostHog's project key is the same kind of
 * value — it can write events, and it cannot read them.
 */
const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const HOST = (process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com').replace(
  /\/$/,
  '',
);
const ANON_KEY = 'graham.analytics.id';

type Properties = Record<string, string | number | boolean>;

let anonId: string | null = null;
let signedInId: string | null = null;
let loading: Promise<void> | null = null;

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `anon-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ready(): Promise<void> {
  if (anonId) return Promise.resolve();
  if (!loading) {
    loading = (async () => {
      const stored = await secureStorage.getItem(ANON_KEY);
      if (stored) {
        anonId = stored;
        return;
      }
      anonId = randomId();
      await secureStorage.setItem(ANON_KEY, anonId);
    })().catch(() => {
      anonId = anonId ?? randomId();
    });
  }
  return loading;
}

async function send(event: string, properties: Properties | undefined, distinctId: string) {
  if (!KEY) return;
  const body = {
    api_key: KEY,
    event,
    distinct_id: distinctId,
    properties: {
      ...properties,
      distinct_id: distinctId,
      $lib: 'graham',
      platform: Platform.OS,
    },
  };
  await fetch(`${HOST}/capture/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(4000),
  });
}

/** Tie later events to the signed-in account, including ones sent before sign-in. */
export function identify(userId: string) {
  if (!KEY || isDemo || signedInId === userId) return;
  signedInId = userId;
  void (async () => {
    await ready();
    // Wait for the stored anon id. Reading it before ready() resolves aliases
    // nothing, and the pre-signup events stay detached from the account.
    if (anonId && anonId !== userId) {
      await send('$identify', { $anon_distinct_id: anonId }, userId).catch(() => undefined);
    }
  })();
}

/** Call on sign-out so the next person on this phone is not the previous account. */
export function resetIdentity() {
  signedInId = null;
}

export function track(event: string, properties?: Properties) {
  if (!KEY || isDemo) return;
  void (async () => {
    await ready();
    const distinctId = signedInId ?? anonId;
    if (!distinctId) return;
    await send(event, properties, distinctId).catch(() => undefined);
  })();
}
