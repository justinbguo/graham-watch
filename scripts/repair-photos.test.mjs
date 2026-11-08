import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = 'sb_secret_repro_do_not_ship';

test('a dealer photo fetch carries no service-role headers', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'repair-photos-'));
  const hitsFile = path.join(dir, 'hits.json');
  const preload = path.join(dir, 'preload.mjs');
  writeFileSync(
    preload,
    `import { writeFileSync } from 'node:fs';
const hits = [];
globalThis.fetch = async (url, init) => {
  const headers = new Headers(init?.headers ?? {});
  hits.push({
    url: String(url),
    authorization: headers.get('authorization'),
    apikey: headers.get('apikey'),
  });
  writeFileSync(${JSON.stringify(hitsFile)}, JSON.stringify(hits));
  const target = String(url);
  if (target.includes('/listing_photos')) {
    return new Response(JSON.stringify([{
      id: 'photo-1',
      listing_id: 'listing-1',
      position: 0,
      source_url: 'https://dealer.example/watches/photo.jpg',
      storage_path: 'listing-1/0.jpg',
    }]), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (target.includes('/storage/')) return new Response('missing', { status: 404 });
  return new Response(Uint8Array.from([1, 2, 3, 4]), { status: 200 });
};
`,
  );

  const child = spawn(process.execPath, ['--import', preload, 'scripts/repair-placeholder-photos.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_ANON_KEY: 'anon-test',
      SUPABASE_SERVICE_ROLE_KEY: KEY,
    },
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', resolve);
  });
  assert.equal(code, 0, stderr);
  const hits = JSON.parse(readFileSync(hitsFile, 'utf8'));
  const dealer = hits.find((hit) => hit.url === 'https://dealer.example/watches/photo.jpg');
  const storage = hits.find((hit) => hit.url.includes('/storage/v1/object/public/listing-photos/'));
  assert.ok(dealer, 'the fallback fetch never ran');
  assert.equal(dealer.authorization, null);
  assert.equal(dealer.apikey, null);
  assert.equal(storage.authorization, `Bearer ${KEY}`);
  assert.equal(storage.apikey, KEY);
});
