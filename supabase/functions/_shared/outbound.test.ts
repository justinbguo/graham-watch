import { assertEquals } from 'jsr:@std/assert@1';

import { headersForHost } from './outbound.mjs';

const KEY = 'sb_secret_repro_do_not_ship';
const seeded = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'User-Agent': 'GrahamBot/0.1',
};

Deno.test('a dealer host loses credential headers and the Supabase host keeps them', () => {
  const dealer = headersForHost('https://dealer.example/watches/photo.jpg', 'http://127.0.0.1:54321', seeded);
  assertEquals(dealer.get('authorization'), null);
  assertEquals(dealer.get('apikey'), null);
  assertEquals(dealer.get('user-agent'), 'GrahamBot/0.1');

  const storage = headersForHost(
    'http://127.0.0.1:54321/storage/v1/object/public/listing-photos/listing-1/0.jpg',
    'http://127.0.0.1:54321',
    seeded,
  );
  assertEquals(storage.get('authorization'), `Bearer ${KEY}`);
  assertEquals(storage.get('apikey'), KEY);

  const otherProject = headersForHost(
    'https://other.supabase.co/storage/v1/object/public/listing-photos/a.jpg',
    'https://hbxgxtbtefpyutyqafoi.supabase.co',
    seeded,
  );
  assertEquals(otherProject.get('authorization'), null);
  assertEquals(otherProject.get('apikey'), null);

  const open = headersForHost('https://dealer.example/a', null, seeded);
  assertEquals(open.get('authorization'), null);
  const broken = headersForHost('::', 'http://127.0.0.1:54321', seeded);
  assertEquals(broken.get('apikey'), null);
});
