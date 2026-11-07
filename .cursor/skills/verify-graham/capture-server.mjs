/**
 * Pretends to be Expo's push API. Writes every body to disk and returns an
 * ok ticket so notify-drops marks the row sent. Nothing here calls exp.host.
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.env.CAPTURE_FILE ?? '/captures/pushes.json';

function read() {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.end('ok');
    return;
  }
  if (req.method === 'POST' && req.url?.split('?')[0] === '/push') {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      let messages = [];
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '[]');
        messages = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        messages = [];
      }
      const all = read();
      all.push({ at: new Date().toISOString(), messages });
      writeFileSync(file, JSON.stringify(all, null, 2));
      const data = messages.map((_, index) => ({
        status: 'ok',
        id: `verify-ticket-${all.length}-${index}`,
      }));
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ data }));
    });
    return;
  }
  res.statusCode = 404;
  res.end();
});

server.listen(8799, '0.0.0.0');
