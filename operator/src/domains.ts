/**
 * Turning whatever an operator pasted into a list of shops to add.
 *
 * The input is a spreadsheet export, a list copied off a forum post, or a
 * column of URLs — so this is deliberately forgiving about shape and strict
 * about what counts as a domain. Anything it cannot read is returned as a
 * rejection with its line number rather than dropped, because a silent skip in
 * a forty-line paste is a shop that never gets added and never gets missed.
 */

export type ParsedShop = {
  /** Bare host, lowercased, `www.` kept off. What identifies the shop. */
  domain: string;
  /** From a `name` column, if the file had one. Otherwise discovery decides. */
  name?: string;
  /** From an `email` column. Otherwise discovery decides. */
  email?: string;
  /** 1-based, so a rejection can be pointed at. */
  line: number;
};

export type Rejection = { line: number; text: string; why: string };

export type ParseResult = {
  shops: ParsedShop[];
  rejected: Rejection[];
  /** Same domain twice in one paste. Counted, not reported per line. */
  duplicates: number;
};

/**
 * A single CSV row.
 *
 * Quoted fields are honoured because a shop name with a comma in it is
 * ordinary — "Watches, Ltd" must not become two fields. Doubled quotes inside a
 * quoted field are the escape CSV actually uses.
 */
export function splitCsvRow(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',' || char === '\t' || char === ';') {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }

  fields.push(field);
  return fields.map((value) => value.trim());
}

// A hostname with at least one dot and a plausible TLD. Deliberately not a
// full domain grammar: the point is to reject "Shop Name" and "n/a", not to
// adjudicate exotic TLDs. Discovery rejects what does not resolve.
const HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i;

/** Hosts that are not a shop, however well-formed they look. */
const NOT_A_SHOP =
  /^(localhost|.*\.local|.*\.internal|127\..*|10\..*|192\.168\..*|169\.254\..*|0\..*)$/i;

/**
 * The host from anything domain-shaped: a bare domain, a full product URL, a
 * `mailto:`, or a domain with a stray trailing comma from a half-parsed CSV.
 */
export function toDomain(raw: string): string | null {
  let text = raw.trim().replace(/^[<([]+|[>)\].,;]+$/g, '');
  if (!text) return null;

  // An email in the domain column is a common paste mistake and its domain is
  // almost always the shop.
  const at = text.lastIndexOf('@');
  if (at !== -1) text = text.slice(at + 1);

  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;

  let host: string;
  try {
    host = new URL(text).hostname.toLowerCase();
  } catch {
    return null;
  }

  host = host.replace(/^www\./, '');
  if (!HOST.test(host) || NOT_A_SHOP.test(host)) return null;
  return host;
}

/** Column names a spreadsheet is likely to use, mapped to what we need. */
const HEADERS: Record<string, 'domain' | 'name' | 'email'> = {
  domain: 'domain',
  website: 'domain',
  url: 'domain',
  site: 'domain',
  link: 'domain',
  shop: 'name',
  name: 'name',
  'shop name': 'name',
  dealer: 'name',
  email: 'email',
  'contact email': 'email',
  contact: 'email',
};

/**
 * Reads the first row as a header only when it names columns *and* holds no
 * domain. A file whose first line is `rolexpassion.com` is data, and eating it
 * as a header would quietly drop a shop.
 */
function readHeader(fields: string[]): Record<string, number> | null {
  if (fields.some((field) => toDomain(field))) return null;

  const mapped: Record<string, number> = {};
  fields.forEach((field, index) => {
    const key = HEADERS[field.toLowerCase().trim()];
    if (key && !(key in mapped)) mapped[key] = index;
  });

  return 'domain' in mapped ? mapped : null;
}

export function parseShops(input: string): ParseResult {
  const lines = input.split(/\r?\n/);
  const shops: ParsedShop[] = [];
  const rejected: Rejection[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  let header: Record<string, number> | null = null;

  lines.forEach((raw, index) => {
    const line = index + 1;
    const text = raw.trim();

    // Blank lines and `# a comment` are how people annotate a pasted list.
    if (!text || text.startsWith('#')) return;

    const fields = splitCsvRow(text);

    if (index === 0) {
      header = readHeader(fields);
      if (header) return;
    }

    // With a header, the domain column is the one it named. Without one, take
    // the first field that reads as a domain, so `Rolex Passion, rolex.com`
    // works as well as the other order.
    const candidate = header
      ? fields[header.domain]
      : (fields.find((field) => toDomain(field)) ?? fields[0]);

    const domain = toDomain(candidate ?? '');
    if (!domain) {
      rejected.push({
        line,
        text: text.length > 60 ? `${text.slice(0, 57)}…` : text,
        why: 'no domain here',
      });
      return;
    }

    if (seen.has(domain)) {
      duplicates += 1;
      return;
    }
    seen.add(domain);

    const named = header?.name !== undefined ? fields[header.name]?.trim() : '';
    const emailed = header?.email !== undefined ? fields[header.email]?.trim() : '';

    shops.push({
      domain,
      line,
      ...(named ? { name: named } : {}),
      // A column headed `email` holding something that is not one is worse
      // than no column: it becomes the address buyer inquiries are sent to.
      ...(emailed && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailed) ? { email: emailed } : {}),
    });
  });

  return { shops, rejected, duplicates };
}
