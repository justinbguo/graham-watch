/**
 * Where a notification tap goes. Kept off `expo-notifications` so the choice
 * can be tested without a phone.
 *
 * A reply carries `conversationId` and nothing else. A drop carries `kind`
 * plus the log row, and a shop id when every watch in the push is from one
 * shop. Anything else is not a tap we know how to open.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PushRoute =
  | { type: 'conversation'; conversationId: string }
  | { type: 'drop'; dropNotificationId: string; dealerId: string | null };

function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value : null;
}

/** Where the tap lands. One shop opens that shop's drops. Several open the list. */
export function pathForPushRoute(route: PushRoute): string {
  if (route.type === 'conversation') return `/conversation/${route.conversationId}`;
  if (route.dealerId) return `/drops?dealerId=${route.dealerId}`;
  return '/drops';
}

export function routeFromPushData(data: unknown): PushRoute | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;

  if (record.kind === 'drop') {
    const dropNotificationId = uuid(record.dropNotificationId);
    if (!dropNotificationId) return null;
    return {
      type: 'drop',
      dropNotificationId,
      dealerId: uuid(record.dealerId),
    };
  }

  const conversationId = record.conversationId;
  if (typeof conversationId === 'string' && conversationId.length > 0) {
    return { type: 'conversation', conversationId };
  }
  return null;
}
