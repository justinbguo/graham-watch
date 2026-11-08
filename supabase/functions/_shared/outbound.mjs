const CREDENTIAL = /^(authorization|proxy-authorization|apikey|cookie|x-api-key|x-graham-cron-secret)$/i;

/**
 * Credentials stay on the configured Supabase host. Every other host gets a
 * copy with those headers removed, including a URL that does not parse.
 */
export function headersForHost(targetUrl, trustedOrigin, headers) {
  const next = new Headers(headers);
  let trusted = false;
  try {
    if (trustedOrigin) {
      trusted = new URL(targetUrl).hostname === new URL(trustedOrigin).hostname;
    }
  } catch {
    trusted = false;
  }
  if (!trusted) {
    for (const name of [...next.keys()]) {
      if (CREDENTIAL.test(name)) next.delete(name);
    }
  }
  return next;
}
