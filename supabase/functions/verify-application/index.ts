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

/** Six digits from the system generator, the same as claim-dealer. */
function code(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 1_000_000).padStart(6, '0');
}

function compose(to: string, shopName: string, value: string) {
  return {
    to,
    // Nothing to reply to. A dealer answering this mail should reach a person,
    // not the address that sends codes.
    replyTo: Deno.env.get('SUPPORT_EMAIL') ?? 'Graham <hello@graham.app>',
    subject: `Your code to list ${shopName} on Graham`,
    text: [
      `Someone applied to list ${shopName} on Graham using this address.`,
      '',
      `Your code: ${value}`,
      '',
      'It expires in 15 minutes and can only be used by the account that asked',
      'for it, so forwarding this email does not hand over the shop.',
      '',
      'Entering it tells us the application is really from the shop. We read',
      'every application by hand afterwards and will write to you either way.',
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

  let applicationId: string;
  let email: string;
  try {
    const body = await req.json();
    applicationId = String(body?.applicationId ?? '');
    email = String(body?.email ?? '').trim().toLowerCase();
    if (!applicationId) throw new Error('Which application?');
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
      throw new Error('That is not an email address.');
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Bad request.' }, 400);
  }

  // The applicant's own row, so the shop name for the mail comes from what they
  // typed rather than from anything the caller can set in this request.
  const { data: application } = await asUser
    .from('dealer_applications')
    .select('shop_name, status, verified_at')
    .eq('id', applicationId)
    .maybeSingle();

  if (!application) return json({ error: 'No such application.' }, 404);
  if (application.status !== 'pending') {
    return json({ error: 'That application has already been answered.' }, 409);
  }
  if (application.verified_at) return json({ error: 'That address is already proved.' }, 409);

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  const value = code();

  // The database decides whether this address may receive a code, so the rule
  // lives next to the data rather than in whichever caller asks next.
  const stored = await service.rpc('store_application_claim_code', {
    p_application_id: applicationId,
    p_requested_by: user.id,
    p_email: email,
    p_code: value,
  });

  if (stored.error) {
    const tooMany = stored.error.code === '53400';
    return json({ error: stored.error.message }, tooMany ? 429 : 403);
  }

  try {
    await send(compose(email, application.shop_name, value));
  } catch (error) {
    console.error('verify-application send failed', error);
    return json({ error: 'Could not send that code. Try again shortly.' }, 502);
  }

  // Echoed whole, unlike claim-dealer. The applicant typed this address a
  // moment ago, so masking it would hide nothing and only read as a mistake.
  return json({ sentTo: email, expiresAt: stored.data });
});
