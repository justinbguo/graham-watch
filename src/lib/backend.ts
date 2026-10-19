import { isDemo } from '@/lib/demo';
import { env } from '@/lib/env';
import { isLocalStackHost } from '@/lib/localHost';

export type BackendKind = 'demo' | 'local' | 'hosted';

export type BackendInfo = {
  kind: BackendKind;
  /** Host the app is calling (LAN IP on a phone when local). */
  host: string;
  /** One line for Settings and sign-in. */
  title: string;
  /** What to do when login says the account is missing. */
  accountHint: string;
  /** Short label for inline errors. */
  shortLabel: string;
};

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

/** Which Supabase project this build is talking to. Not the same as npm scripts unless env matches. */
export function backendInfo(): BackendInfo {
  if (isDemo) {
    return {
      kind: 'demo',
      host: 'demo',
      title: 'Demo mode',
      shortLabel: 'Demo',
      accountHint: 'Demo mode has no real accounts. Turn off EXPO_PUBLIC_DEMO and restart Metro.',
    };
  }

  const host = hostFromUrl(env.supabaseUrl);
  const local = isLocalStackHost(host);

  if (local) {
    return {
      kind: 'local',
      host,
      title: 'Local database (this Mac)',
      shortLabel: `Local · ${host}`,
      accountHint:
        'Local users are wiped by npm run db:reset. Use Create account, or npm run mock:users for test logins. Hosted accounts do not exist here.',
    };
  }

  const project = host.replace(/\.supabase\.co$/, '');
  return {
    kind: 'hosted',
    host,
    title: 'Hosted database',
    shortLabel: `Hosted · ${project}`,
    accountHint:
      'This is production Supabase. Local accounts are not here. Fixture dealer: npm run mock:users -- --yes --gold-only then npm run mock:signin -- gold@graham.test on your Mac.',
  };
}
