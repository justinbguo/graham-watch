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

/** A catalogue read that must not start, because the shop's own rules say so. */
export class CatalogueRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogueRefused';
  }
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
