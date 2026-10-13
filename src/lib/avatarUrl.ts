import { env } from '@/lib/env';
import { isLocalStackHost } from '@/lib/localHost';

/**
 * The profile stores a storage path, or an older absolute URL. On Colima,
 * `supabase status` prints the VM address (172.19.x). A phone cannot open
 * that, so the picture looks unsaved. Rebuild our own storage URLs against
 * the host this device is already using. A Google or Apple picture is left
 * as it arrived.
 */
export function avatarUrl(stored: string | null): string | null {
  if (!stored) return null;
  if (!/^https?:\/\//i.test(stored)) {
    if (stored.includes('://')) return stored;
    const queryAt = stored.indexOf('?');
    const path = queryAt === -1 ? stored : stored.slice(0, queryAt);
    const query = queryAt === -1 ? '' : stored.slice(queryAt);
    return `${env.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/avatars/${path}${query}`;
  }

  let url: URL;
  try {
    url = new URL(stored);
  } catch {
    return stored;
  }
  if (!isLocalStackHost(url.hostname) || !url.pathname.includes('/storage/v1/object/')) {
    return stored;
  }
  const current = new URL(env.supabaseUrl);
  if (url.origin === current.origin) return stored;
  url.protocol = current.protocol;
  url.hostname = current.hostname;
  url.port = current.port;
  return url.toString();
}
