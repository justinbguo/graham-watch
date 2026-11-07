/**
 * Serves an Expo web export. Unknown paths return index.html so client routes
 * such as /profile load.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const dir = process.argv[2];
const port = Number(process.argv[3] ?? '8091');
if (!dir || !Number.isInteger(port)) {
  process.stderr.write('usage: web-server.mjs <dir> <port>\n');
  process.exit(1);
}

const types = {
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function fileFor(pathname) {
  const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const candidate = path.join(dir, safe);
  if (!candidate.startsWith(dir)) return path.join(dir, 'index.html');
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  const index = path.join(candidate, 'index.html');
  if (existsSync(index)) return index;
  return path.join(dir, 'index.html');
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const file = fileFor(decodeURIComponent(url.pathname));
  if (!existsSync(file)) {
    res.statusCode = 404;
    res.end('not found');
    return;
  }
  res.setHeader('content-type', types[path.extname(file)] ?? 'application/octet-stream');
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1');
