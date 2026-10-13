/**
 * Wall-clock ceilings for calls to servers we do not control.
 *
 * Every outbound call needs one. A fetch with no deadline can outlive the
 * invocation that started it, and when the platform kills the process the
 * `import_jobs` row it was working on is never updated — the refresh shows
 * "running" forever with nothing behind it.
 *
 * The values differ because the work does. Firecrawl runs a headless browser;
 * a photograph is one file off a CDN.
 */
export const TIMEOUT = {
  /** A shop's own JSON feed or product page. */
  source: 20_000,
  /** One photograph. */
  photo: 15_000,
  /** Firecrawl renders JavaScript, so it is the slowest by design. */
  render: 60_000,
  /** Jina cleans a page it has already fetched. */
  reader: 45_000,
  /** One OpenAI structured-output call. */
  model: 60_000,
  /** One transactional email. */
  mail: 15_000,
} as const;
