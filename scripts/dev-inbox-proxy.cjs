/**
 * The browser will not read Mailpit. A page on :8081 calling :54324 is a
 * different site, and Mailpit sends no Access-Control-Allow-Origin, so Chrome
 * drops the body. The phone app is not a browser and is not subject to that
 * rule. Metro is on the Mac, so it reads Mailpit and answers on the page's
 * own origin.
 *
 * Only the two read routes. Anything else is refused so this is not a proxy
 * to an arbitrary URL.
 */
const MAILPIT = 'http://127.0.0.1:54324';
const PREFIX = '/__dev-inbox';

function allowed(pathname) {
  return pathname === '/api/v1/messages' || /^\/api\/v1\/message\/[A-Za-z0-9_-]+$/.test(pathname);
}

function devInboxMiddleware(req, res, next) {
  const raw = req.url || '';
  if (!raw.startsWith(PREFIX)) return next();
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.end();
    return;
  }

  const target = raw.slice(PREFIX.length) || '/';
  const pathname = target.split('?')[0];
  if (!allowed(pathname)) {
    res.statusCode = 404;
    res.end();
    return;
  }

  fetch(`${MAILPIT}${target}`)
    .then(async (upstream) => {
      const body = Buffer.from(await upstream.arrayBuffer());
      res.statusCode = upstream.status;
      const type = upstream.headers.get('content-type');
      if (type) res.setHeader('Content-Type', type);
      if (req.method === 'HEAD') res.end();
      else res.end(body);
    })
    .catch(() => {
      if (res.headersSent) return;
      res.statusCode = 502;
      res.end();
    });
}

module.exports = { PREFIX, allowed, devInboxMiddleware };
