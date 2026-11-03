/** Expo's push API. One message per token so a dead device can be dropped on its own. */

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_CHUNK = 100;
export const PUSH_CHANNEL_ID = 'watch-updates';

export type DropPushMessage = {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  priority: 'high';
  channelId: string;
  data: {
    kind: 'drop';
    dropNotificationId: string;
    dealerId?: string;
  };
};

export function dropPushMessages(input: {
  tokens: string[];
  title: string;
  body: string;
  notificationId: string;
  dealerId: string | null;
}): DropPushMessage[] {
  return input.tokens.map((token) => {
    const data: DropPushMessage['data'] = {
      kind: 'drop',
      dropNotificationId: input.notificationId,
    };
    if (input.dealerId) data.dealerId = input.dealerId;
    return {
      to: token,
      title: input.title,
      body: input.body,
      sound: 'default',
      priority: 'high',
      channelId: PUSH_CHANNEL_ID,
      data,
    };
  });
}

export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error('chunk size must be at least 1');
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

/** Expo wraps the ticket array in `{ data }` and sometimes returns the array itself. */
export function ticketsFromExpoBody(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object' && Array.isArray((body as { data?: unknown }).data)) {
    return (body as { data: unknown[] }).data;
  }
  return null;
}

export type TicketReading = {
  okIds: string[];
  deadTokens: string[];
  anyOk: boolean;
};

/**
 * Tickets line up with the messages in that request. DeviceNotRegistered means
 * the token will never work again; anything else (a rate limit, a malformed
 * payload) keeps the token for the next night.
 */
export function readTickets(tokens: string[], tickets: unknown[]): TicketReading {
  const okIds: string[] = [];
  const deadTokens: string[] = [];
  let anyOk = false;
  for (let index = 0; index < tokens.length; index += 1) {
    const ticket = tickets[index];
    if (!ticket || typeof ticket !== 'object') continue;
    const row = ticket as { status?: unknown; id?: unknown; details?: { error?: unknown } | null };
    if (row.status === 'ok') {
      anyOk = true;
      if (typeof row.id === 'string' && row.id) okIds.push(row.id);
      continue;
    }
    if (row.status === 'error' && row.details?.error === 'DeviceNotRegistered') {
      const token = tokens[index];
      if (token) deadTokens.push(token);
    }
  }
  return { okIds, deadTokens, anyOk };
}
