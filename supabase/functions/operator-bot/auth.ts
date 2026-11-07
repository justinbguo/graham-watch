import { timingSafeEqual } from 'node:crypto';

type Env = { get(name: string): string | undefined };

/** Bearer token, or the apikey header when Authorization is empty. */
export function offeredSecret(req: Request): string {
  const header = req.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(\S+)\s*$/i);
  if (match?.[1]) return match[1];
  return (req.headers.get('apikey') ?? '').trim();
}

export function configuredSecret(env: Env): string | null {
  const value = env.get('GRAHAM_OPERATOR_SECRET')?.trim() ?? '';
  return value.length > 0 ? value : null;
}

/** SHA-256 both sides so a length mismatch cannot skip the constant-time compare. */
export async function secretMatches(offered: string, expected: string): Promise<boolean> {
  const encode = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encode.encode(offered)),
    crypto.subtle.digest('SHA-256', encode.encode(expected)),
  ]);
  return timingSafeEqual(new Uint8Array(left), new Uint8Array(right));
}
