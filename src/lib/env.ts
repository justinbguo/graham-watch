import Constants from 'expo-constants';

import { isDemo } from './demo';
import { supabaseUrlForDevice } from './localHost';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** `192.168.x.x:8081` while Expo Go is serving this bundle. Absent in a release build. */
function devServerHost(): string | null {
  const raw = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  if (!raw) return null;
  return raw.replace(/:\d+$/, '');
}

if (!isDemo && (!url || !anonKey)) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Run `npm run env -- local` after `npm run db:start`, or put the hosted pair in .env.'
  );
}

export const env = {
  // Demo mode never reaches the network, but the client still has to construct.
  // A phone cannot open 127.0.0.1 on this Mac, so copy Metro's LAN host.
  supabaseUrl:
    !url || isDemo ? url || 'http://demo.invalid' : supabaseUrlForDevice(url, devServerHost()),
  supabaseAnonKey: anonKey || 'demo',
};
