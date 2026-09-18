import { createClient } from '@supabase/supabase-js';

// One source of schema truth. Importing the app's generated types rather than
// re-declaring them here means `npm run db:types` keeps this app honest too, and
// a column this UI reads cannot quietly stop existing.
import type { Database } from '../../src/lib/database.types';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy operator/.env.example to operator/.env.local.'
  );
}

/**
 * The anon key, deliberately. It is safe in a browser: every operator action
 * goes through a function that checks the caller against the `operators` table,
 * so authority comes from who is signed in rather than from the key.
 *
 * The service role key must never appear in this app. It bypasses row-level
 * security on every table in the project, including every buyer's saved list.
 */
export const supabase = createClient<Database>(url, anonKey);

export type Application =
  Database['public']['Tables']['dealer_applications']['Row'];
export type OperatorDealer =
  Database['public']['Functions']['operator_dealers']['Returns'][number];
export type Permission = Database['public']['Enums']['dealer_permission'];
export type Volume = Database['public']['Enums']['listing_volume'];

export const VOLUME_LABELS: Record<Volume, string> = {
  under_10: 'under 10',
  '10_to_50': '10–50',
  '50_to_200': '50–200',
  over_200: '200+',
};

/** Mailpit is where the local stack dumps mail. Handy, not required. */
export const MAILPIT = 'http://127.0.0.1:54324';

function hostOf(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

const host = hostOf(url);

/**
 * Which Graham this tab is pointed at.
 *
 * These screens are identical against local and production, and the difference
 * is whether pulling a shop back empties a real buyer's deck. So the answer is
 * on screen at all times, and anything that writes asks first when the answer
 * is production.
 */
export const target = {
  url,
  host,
  isLocal: ['127.0.0.1', 'localhost'].includes(host),
} as const;

export function confirmWrite(question: string): boolean {
  if (target.isLocal) return true;
  return window.confirm(`${question}\n\nThis is production: ${target.host}`);
}
