import type { Database } from '@/lib/database.types';
import { secureStorage } from '@/lib/secureStorage';

export type AccountRole = Database['public']['Enums']['account_type'];

const KEY = 'graham.pendingRole';

/**
 * Which door someone picked on the sign-in screen, held across the gap between
 * picking it and having an account to write it to.
 *
 * A stash rather than state passed down the tree, because the session can
 * arrive through three different paths: verifyOtp on this screen, a magic-link
 * deep link handled in session.tsx, or an OAuth browser round trip that
 * unmounts the screen entirely. Only a stash survives all three.
 *
 * Absence is a real answer — a returning user on a new device never picked
 * anything — so onboarding asks rather than assuming buyer.
 */
export async function rememberRole(role: AccountRole): Promise<void> {
  await secureStorage.setItem(KEY, role);
}

export async function takeRole(): Promise<AccountRole | null> {
  const stored = await secureStorage.getItem(KEY);
  if (stored !== 'buyer' && stored !== 'dealer') return null;
  return stored;
}

export async function forgetRole(): Promise<void> {
  await secureStorage.removeItem(KEY);
}
