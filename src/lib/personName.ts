export const NAME_MAX_LENGTH = 80;

/** What lands in `profiles.first_name` / `profiles.last_name`. `last` is null for a one-word name. */
export type PersonName = { first: string; last: string | null };

export type NameCheck =
  | { ok: true; name: PersonName }
  | { ok: false; reason: 'empty' | 'too_long' };

const collapse = (text: string) => text.trim().replace(/\s+/g, ' ');

const ok = (first: string, last: string | null): NameCheck => ({ ok: true, name: { first, last } });

/** First space splits, matching `handle_new_user`. A line that still starts with `knownFirst` keeps that given name. */
export function parseName(text: string, knownFirst?: string | null): NameCheck {
  const clean = collapse(text);
  if (!clean) return { ok: false, reason: 'empty' };
  if (clean.length > NAME_MAX_LENGTH) return { ok: false, reason: 'too_long' };

  const known = collapse(knownFirst ?? '');
  if (known && (clean === known || clean.startsWith(`${known} `))) {
    return ok(known, clean.slice(known.length).trim() || null);
  }

  const space = clean.indexOf(' ');
  return space < 0 ? ok(clean, null) : ok(clean.slice(0, space), clean.slice(space + 1));
}
