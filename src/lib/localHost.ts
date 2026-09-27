const LOOPBACK = new Set(['localhost', '127.0.0.1']);

/** A host on this LAN, including the Android emulator's alias for the Mac. */
export function isPrivateIPv4(hostname: string): boolean {
  const parts = hostname.split('.');
  if (parts.length !== 4) return false;
  const nums = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  if (nums.some((n) => !Number.isInteger(n) || n > 255)) return false;
  const [a, b] = nums as [number, number, number, number];
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  return a === 172 && b >= 16 && b <= 31;
}

/** Loopback, the emulator alias, or the Mac's LAN address after a phone rewrite. */
export function isLocalStackHost(hostname: string): boolean {
  return LOOPBACK.has(hostname) || isPrivateIPv4(hostname);
}

/**
 * `127.0.0.1` on a phone is the phone. Metro already reached this Mac to
 * deliver the bundle, so the database call uses that same host. A hosted URL
 * is left alone, and so is loopback when there is no LAN address to copy
 * (simulator, web).
 */
export function supabaseUrlForDevice(configured: string, devHost: string | null): string {
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    return configured;
  }
  if (!LOOPBACK.has(url.hostname) || !devHost || !isPrivateIPv4(devHost)) return configured;
  url.hostname = devHost;
  return url.href.replace(/\/$/, '');
}
