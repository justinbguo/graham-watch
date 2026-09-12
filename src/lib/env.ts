import { isDemo } from './demo';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!isDemo && (!url || !anonKey)) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env and fill it in, or run `npm run demo`.'
  );
}

export const env = {
  // Demo mode never reaches the network, but the client still has to construct.
  supabaseUrl: url || 'http://demo.invalid',
  supabaseAnonKey: anonKey || 'demo',
};
