import { Platform } from 'react-native';

import { env } from './env';
import { isLocalStackHost } from './localHost';

const MAILPIT_PORT = 54324;
// Metro answers this path by reading Mailpit. Kept in sync with
// scripts/dev-inbox-proxy.cjs.
const DEV_INBOX_PREFIX = '/__dev-inbox';
const POLL_MS = 400;
const WAIT_MS = 10_000;

const CODE_LABELED = /your code:[\s\S]*?(\d{6})/i;
const CODE_BARE = /\b(\d{6})\b/;

type MailpitAddress = { Address?: string };
type MailpitListMessage = {
  ID: string;
  Created: string;
  To?: MailpitAddress[];
};
type MailpitMessage = {
  Text?: string;
  HTML?: string;
};

/**
 * Mailpit is the fake inbox the local Supabase stack dumps mail into. The app
 * reads the 6-digit code from it so the simulator never has to open a browser.
 *
 * Gated on the Supabase URL host, not `__DEV__`. Expo Go is always "dev", even
 * when pointed at a hosted project — scraping that inbox would be both useless
 * (no Mailpit) and wrong.
 */
export function isLocalInbox(): boolean {
  try {
    return isLocalStackHost(new URL(env.supabaseUrl).hostname);
  } catch {
    return false;
  }
}

function mailpitOrigin(): string | null {
  try {
    const { hostname } = new URL(env.supabaseUrl);
    if (!isLocalStackHost(hostname)) return null;
    // Chrome treats Mailpit's port as another site and discards the response.
    // The page asks Metro, which is on this Mac and can read the inbox.
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return `${window.location.origin}${DEV_INBOX_PREFIX}`;
    }
    return `http://${hostname}:${MAILPIT_PORT}`;
  } catch {
    return null;
  }
}

function addressMatches(actual: string, wanted: string): boolean {
  const got = actual.trim().toLowerCase();
  const need = wanted.trim().toLowerCase();
  if (got === need) return true;
  // Claim returns a masked address (`i•••@shop.com`) so the client never learns
  // a shop's unpublished mailbox. Match first character + domain only.
  const masked = need.match(/^(.)[•*.]{2,}@(.+)$/);
  if (!masked) return false;
  return got.startsWith(masked[1]) && got.endsWith(`@${masked[2]}`);
}

function extractCode(body: string): string | null {
  return body.match(CODE_LABELED)?.[1] ?? body.match(CODE_BARE)?.[1] ?? null;
}

async function latestCode(origin: string, to: string, since: number): Promise<string | null> {
  const list = await fetch(`${origin}/api/v1/messages`);
  if (!list.ok) return null;
  const payload = (await list.json()) as { messages?: MailpitListMessage[] };
  const match = (payload.messages ?? []).find((message) => {
    const addressed = (message.To ?? []).some((entry) =>
      addressMatches(entry.Address ?? '', to)
    );
    if (!addressed) return false;
    const created = Date.parse(message.Created);
    return Number.isNaN(created) || created >= since;
  });
  if (!match) return null;

  const detail = await fetch(`${origin}/api/v1/message/${match.ID}`);
  if (!detail.ok) return null;
  const body = (await detail.json()) as MailpitMessage;
  return extractCode(`${body.Text ?? ''}\n${body.HTML ?? ''}`);
}

/**
 * Poll until Mailpit has a 6-digit code for `to`, or give up. Callers treat
 * null as "type it yourself".
 */
export async function waitForLatestCode(to: string, since: number): Promise<string | null> {
  const origin = mailpitOrigin();
  if (!origin) return null;

  const deadline = Date.now() + WAIT_MS;
  // Mailpit's Created can beat Date.now() on the client by a second or two.
  const notBefore = since - 2_000;

  while (Date.now() < deadline) {
    try {
      const code = await latestCode(origin, to, notBefore);
      if (code) return code;
    } catch {
      // Unreachable inbox (physical device, Mailpit down). Keep waiting until
      // the deadline so a slow boot is not reported as a hard failure.
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return null;
}
