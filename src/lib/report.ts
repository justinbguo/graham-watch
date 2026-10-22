import { Platform } from 'react-native';

import { isDemo } from './demo';

/**
 * JavaScript crashes, posted to Sentry when a DSN is set.
 *
 * This is the store endpoint, not `@sentry/react-native`. That package is a
 * native module Expo Go cannot load, and its config plugin fails the iOS
 * build until a Sentry org and auth token exist. A DSN in the environment
 * turns this on for the next bundle; native crashes (a killed process with
 * no JavaScript stack) still need that plugin later.
 */
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

type ParsedDsn = { key: string; host: string; project: string };

function parseDsn(dsn: string): ParsedDsn | null {
  const match = /^https:\/\/([^@]+)@([^/]+)\/(\d+)\/?$/.exec(dsn.trim());
  if (!match) return null;
  return { key: match[1], host: match[2], project: match[3] };
}

const parsed = DSN ? parseDsn(DSN) : null;

let lastMessage = '';
let lastAt = 0;
let installed = false;

function eventId(): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  return uuid.replace(/-/g, '').padEnd(32, '0').slice(0, 32);
}

export function captureException(error: unknown, extra?: { fatal?: boolean }) {
  if (!parsed || isDemo) return;

  const isError = error instanceof Error;
  const message = (isError ? error.message : String(error ?? 'Unknown error')).slice(0, 2000);
  const now = Date.now();
  if (message === lastMessage && now - lastAt < 5000) return;
  lastMessage = message;
  lastAt = now;

  const event = {
    event_id: eventId(),
    timestamp: new Date(now).toISOString(),
    platform: 'javascript',
    level: extra?.fatal ? 'fatal' : 'error',
    environment: __DEV__ ? 'development' : 'production',
    exception: {
      values: [
        {
          type: isError ? error.name : 'Error',
          value: message,
        },
      ],
    },
    extra: {
      stack: isError ? error.stack?.slice(0, 8000) : undefined,
    },
    tags: {
      os: Platform.OS,
      fatal: extra?.fatal ? 'true' : 'false',
    },
  };

  const envelope = `${JSON.stringify({ event_id: event.event_id, dsn: DSN, sent_at: event.timestamp })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}`;

  void fetch(`https://${parsed.host}/api/${parsed.project}/envelope/`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-sentry-envelope',
      'x-sentry-auth': `Sentry sentry_version=7, sentry_client=graham/1.0.0, sentry_key=${parsed.key}`,
    },
    body: envelope,
    signal: AbortSignal.timeout(4000),
  }).catch(() => undefined);
}

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;

/** Install once, before the first screen. A missing or unparseable DSN does nothing. */
export function installErrorReporter() {
  if (installed || !parsed || isDemo) return;
  installed = true;

  const utils = (
    globalThis as {
      ErrorUtils?: {
        getGlobalHandler: () => GlobalHandler;
        setGlobalHandler: (handler: GlobalHandler) => void;
      };
    }
  ).ErrorUtils;

  if (utils) {
    const previous = utils.getGlobalHandler();
    utils.setGlobalHandler((error, isFatal) => {
      captureException(error, { fatal: Boolean(isFatal) });
      previous(error, isFatal);
    });
  }

  const target = globalThis as {
    addEventListener?: (type: string, listener: (event: { error?: unknown; reason?: unknown; message?: string }) => void) => void;
  };
  if (typeof target.addEventListener !== 'function') return;

  target.addEventListener('error', (event) => {
    captureException(event.error ?? event.message);
  });
  target.addEventListener('unhandledrejection', (event) => {
    captureException(event.reason);
  });
}
