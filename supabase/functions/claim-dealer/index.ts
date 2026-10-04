import { createClient } from 'jsr:@supabase/supabase-js@2';

import { send } from '../_shared/mailer.ts';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

/**
 * Six digits from the system generator, not Math.random. This is the only thing
 * standing between a stranger and a shop's inventory.
 */
function code(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 1_000_000).padStart(6, '0');
}

/**
 * Always masked on the way out. The caller may not have supplied the address —
 * omitting it means "use the one on the shop's site" — and echoing that back
 * would turn this endpoint into a reader for every dealer's contact address.
 */
function mask(email: string): string {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1)}•••@${domain}`;
}

function compose(to: string, shopName: string, value: string) {
  return {
    to,
    // Nothing to reply to. A dealer answering this mail should reach a person,
    // not the address that sends codes.
    replyTo: Deno.env.get('SUPPORT_EMAIL') ?? 'Graham <hello@graham.watch>',
    subject: `Your code to claim ${shopName} on Graham`,
    text: [
      `Someone asked to manage ${shopName} on Graham using this address.`,
      '',
      `Your code: ${value}`,
      '',
      'It expires in 15 minutes and can only be used by the account that asked',
      'for it, so forwarding this email does not hand over the shop.',
      '',
      'If this was not you, ignore it. Nothing changes until the code is entered.',
    ].join('\n'),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'Not signed in.' }, 401);

  // Read as the caller so auth decides who they are, then write as the service
  // role: the codes table is unreachable through PostgREST by design.
  const asUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } }
  );

  const { data: auth } = await asUser.auth.getUser();
  const user = auth?.user;
  if (!user) return json({ error: 'Not signed in.' }, 401);

  let dealerId: string;
  let requested: string | null;
  try {
    const body = await req.json();
    dealerId = String(body?.dealerId ?? '');
    requested = body?.email ? String(body.email).trim().toLowerCase() : null;
    if (!dealerId) throw new Error('Which shop?');
    if (requested !== null && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(requested)) {
      throw new Error('That is not an email address.');
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Bad request.' }, 400);
  }

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  const { data: dealer } = await service
    .from('dealers')
    .select('name, claimed_by, contact_email')
    .eq('id', dealerId)
    .maybeSingle();

  if (!dealer) return json({ error: 'No such shop.' }, 404);
  if (dealer.claimed_by) return json({ error: 'That shop has already been claimed.' }, 409);

  // Omitting the address means "the one on your site", so a dealer who reads the
  // published mailbox never has to be shown it.
  const email = requested ?? dealer.contact_email?.trim().toLowerCase() ?? null;
  if (!email) return json({ error: 'That shop has no address on file.' }, 400);

  const value = code();

  // The database decides whether this address may receive a code, so the rule
  // lives next to the data rather than in whichever caller asks next.
  const stored = await service.rpc('store_dealer_claim_code', {
    p_dealer_id: dealerId,
    p_requested_by: user.id,
    p_email: email,
    p_code: value,
  });

  if (stored.error) {
    const tooMany = stored.error.code === '53400';
    return json({ error: stored.error.message }, tooMany ? 429 : 403);
  }

  try {
    await send(compose(email, dealer.name, value));
  } catch (error) {
    console.error('claim-dealer send failed', error);
    return json({ error: 'Could not send that code. Try again shortly.' }, 502);
  }

  return json({ sentTo: mask(email), expiresAt: stored.data });
});
