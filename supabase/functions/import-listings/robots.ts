import { USER_AGENT } from './source.ts';

/**
 * The slice of robots.txt a catalogue read has to obey.
 *
 * Groups, longest-match Allow/Disallow, and `*` as the fallback are the part
 * Shopify's storefront file actually uses. Crawl-delay is read so a shop that
 * asks for a pause gets one. Sitemap lines and the adsbot group are ignored
 * because they are not rules for us.
 */
export type RobotsPolicy = {
  /** Milliseconds the matching group asks us to wait between requests. */
  crawlDelayMs: number | null;
  allows(url: URL): boolean;
};

type Rule = { allow: boolean; pattern: string };
type Group = { agents: string[]; rules: Rule[]; crawlDelayMs: number | null };

/**
 * A catalogue read that must not start, or that stopped.
 * `status` is the HTTP status a caller should see. 400 is a rule that will
 * not change on retry. 502 is a feed that failed this time.
 */
export class CatalogueRefused extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'CatalogueRefused';
    this.status = status;
  }
}

export function httpStatusOf(error: unknown, fallback: number): number {
  return error instanceof CatalogueRefused ? error.status : fallback;
}

/**
 * Wall clock for one catalogue invocation.
 *
 * Supabase kills an edge request that is still working after about 150s
 * (`extract.ts`). 120s leaves room for the database write after the last page.
 * A crawl-delay is honored inside this budget. A delay that would blow it
 * skips the read instead of crawling faster than the file asks.
 */
export const CATALOGUE_RUN_BUDGET_MS = 120_000;

/**
 * A pause longer than this is a refusal, before the first catalogue request.
 * Menta asks for 10 seconds. Waiting that out would turn one shop into a
 * single request that still blocks the run, so the read stops instead.
 */
export const MAX_CRAWL_DELAY_MS = 5_000;

export function assertCrawlDelay(crawlDelayMs: number | null): void {
  if (crawlDelayMs != null && crawlDelayMs > MAX_CRAWL_DELAY_MS) {
    throw new CatalogueRefused(
      `robots.txt asks for a ${crawlDelayMs / 1000}s pause between requests, which is more than this catalogue read will wait.`,
    );
  }
}

/** A challenge page served as robots.txt. A robots file is plain text. */
export function robotsBodyIsHtml(body: string): boolean {
  const head = body.trim().slice(0, 256).toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<head');
}

/**
 * Turns one robots response into a policy.
 *
 * A missing file allows the site. HTML is a challenge, not a rules file, so
 * the read stops. A text file with no `User-agent` line has no groups. RFC
 * 9309 then says nothing applies, which is allow. Orphan `Disallow` lines
 * before the first group are not a group, and they are not a reason to
 * refuse the site.
 */
export function policyFromRobotsResponse(status: number, body: string): RobotsPolicy {
  if (status === 404 || status === 410) return parseRobots('');
  if (status < 200 || status >= 300) {
    throw new CatalogueRefused(
      `robots.txt returned ${status}, so this catalogue was not read.`,
    );
  }
  if (body.trim() && robotsBodyIsHtml(body)) {
    throw new CatalogueRefused(
      'robots.txt was not a robots file, so this catalogue was not read.',
    );
  }
  return parseRobots(body);
}

/**
 * Waits the shop's crawl-delay (or the adapter's own floor, whichever is
 * longer) when that wait still fits. False means this request must not go
 * out: the caller skips the rest of the read.
 */
export function createPacer(options: {
  crawlDelayMs: number | null;
  floorMs: number;
  budgetMs?: number;
  pause: (ms: number) => Promise<void>;
  now?: () => number;
}): () => Promise<boolean> {
  const now = options.now ?? Date.now;
  const started = now();
  const budget = options.budgetMs ?? CATALOGUE_RUN_BUDGET_MS;
  const wait = Math.max(options.floorMs, options.crawlDelayMs ?? 0);
  return async () => {
    if (now() - started + wait > budget) return false;
    await options.pause(wait);
    return true;
  };
}

function parseGroups(body: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let seenRule = false;

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const sep = line.indexOf(':');
    if (sep < 0) continue;
    const key = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (key === 'user-agent') {
      // A second agent before any rule shares the group. An agent after rules
      // starts the next one, which is how `*` and `adsbot-google` stay apart.
      if (!current || seenRule) {
        current = { agents: [], rules: [], crawlDelayMs: null };
        groups.push(current);
        seenRule = false;
      }
      if (value) current.agents.push(value);
      continue;
    }

    if (!current) continue;

    if (key === 'allow' || key === 'disallow') {
      seenRule = true;
      // An empty Disallow means "allow the rest". It is not a block.
      if (value) current.rules.push({ allow: key === 'allow', pattern: value });
      continue;
    }

    if (key === 'crawl-delay') {
      seenRule = true;
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelayMs = Math.round(seconds * 1000);
    }
  }

  return groups;
}

/** Longest matching product token wins. `*` scores 0, so a named group beats it. */
function specificity(agents: string[], userAgent: string): number {
  const token = userAgent.toLowerCase();
  let best = -1;
  for (const agent of agents) {
    const name = agent.trim().toLowerCase();
    if (!name) continue;
    if (name === '*') best = Math.max(best, 0);
    else if (token.includes(name)) best = Math.max(best, name.length);
  }
  return best;
}

function pathMatches(pattern: string, path: string): boolean {
  const endAnchored = pattern.endsWith('$');
  const body = endAnchored ? pattern.slice(0, -1) : pattern;
  let source = '^';
  for (const ch of body) {
    source += ch === '*' ? '.*' : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  // `/admin` is a prefix, not only that exact path. `$` is the only anchor.
  if (!endAnchored) source += '.*';
  source += '$';
  return new RegExp(source).test(path);
}

/**
 * Rules for this user agent. No matching group means the file has nothing to
 * say to us, which is allow — the same answer as a missing file.
 */
export function parseRobots(body: string, userAgent = USER_AGENT): RobotsPolicy {
  const groups = parseGroups(body);
  let best = -1;
  for (const group of groups) best = Math.max(best, specificity(group.agents, userAgent));
  const matching = best < 0 ? [] : groups.filter((group) => specificity(group.agents, userAgent) === best);

  let crawlDelayMs: number | null = null;
  for (const group of matching) {
    if (group.crawlDelayMs === null) continue;
    crawlDelayMs = crawlDelayMs === null ? group.crawlDelayMs : Math.max(crawlDelayMs, group.crawlDelayMs);
  }

  return {
    crawlDelayMs,
    allows(url: URL) {
      // Query strings are part of the path Shopify writes rules against
      // (`*sort_by*`, `*filter*&*filter*`). The path alone would miss them.
      const path = `${url.pathname}${url.search}`;
      let winner: { length: number; allow: boolean } | null = null;
      for (const group of matching) {
        for (const rule of group.rules) {
          if (!pathMatches(rule.pattern, path)) continue;
          const length = rule.pattern.length;
          if (
            !winner ||
            length > winner.length ||
            (length === winner.length && rule.allow && !winner.allow)
          ) {
            winner = { length, allow: rule.allow };
          }
        }
      }
      return winner ? winner.allow : true;
    },
  };
}
