import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

import { price, watchName, watchSubject, type MailListing } from '../_shared/listing-mail.ts';

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

type Inquiry = {
  id: string;
  message: string | null;
  dealer_id: string;
  listings: MailListing | null;
};

/**
 * The buyer's own words, in their own voice — this mail leaves their mailbox,
 * not ours. The server composes it anyway because the dealer's address lives
 * here and nowhere else, and shipping the draft whole keeps one copy of the
 * wording instead of one per platform.
 */
function compose(inquiry: Inquiry, dealerName: string | null, buyerName: string | null) {
  const listing = inquiry.listings!;
  const greeting = dealerName ? `Hi ${dealerName},` : 'Hello,';
  // Onboarding requires a name, so this is close to unreachable. An inquiry is
  // still worth more to both sides than a blank where the greeting should be.
  const signature = buyerName ?? 'A buyer on Graham';
  const opener = buyerName ? `My name is ${buyerName}. ` : '';

  return {
    subject: `Inquiry: ${watchSubject(listing)}`,
    body: [
      greeting,
      '',
      `${opener}I'm interested in the ${watchSubject(listing)} ` +
        `you have listed at ${price(listing.price_cents, listing.currency)} — ` +
        `is it still available?`,
      ...(inquiry.message ? ['', inquiry.message] : []),
      '',
      `Listing: ${listing.source_url}`,
      '',
      'Thanks,',
      signature,
    ].join('\n'),
    watch: watchName(listing),
  };
}

async function loadInquiry(supabase: SupabaseClient, inquiryId: string, buyerId: string) {
  const { data, error } = await supabase
    .from('inquiries')
    .select(
      'id, message, dealer_id, ' +
        'listings ( brand, model, reference, year, price_cents, currency, source_url )'
    )
    .eq('id', inquiryId)
    .eq('buyer_id', buyerId)
    .maybeSingle();

  if (error) throw error;
  return data as Inquiry | null;
}

/**
 * Hands back a filled-in mail draft for one inquiry the caller owns.
 *
 * This is the only way a dealer's address reaches a device.
 * `20260912000007_dealer_contact_privacy.sql` revokes `contact_email` from
 * `anon` and `authenticated` as a column grant, so no client can select it —
 * and that has to stay true, because the anon key ships inside the app binary.
 * One address, for one watch the buyer deliberately asked about, is a different
 * thing from a readable column somebody can walk to collect every shop's
 * mailbox.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const authorization = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: 'Sign in first.' }, 401);

  let inquiryId: string;
  try {
    inquiryId = String((await req.json())?.inquiryId ?? '');
    if (!inquiryId) throw new Error('inquiryId is required.');
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }

  // Read through the caller's own token so RLS decides whether this inquiry is
  // theirs. The service role below only reads the address and stamps the row.
  const inquiry = await loadInquiry(supabase, inquiryId, user.id);
  if (!inquiry) return json({ error: 'No such inquiry.' }, 404);
  if (!inquiry.listings) return json({ error: 'That watch is gone.' }, 410);

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: dealer } = await service
    .from('dealers')
    .select('name, contact_email')
    .eq('id', inquiry.dealer_id)
    .maybeSingle();

  if (!dealer?.contact_email) {
    return json({ error: 'We have no address for this dealer yet.' }, 422);
  }

  // The caller's own token cannot see this row once the service role takes
  // over, and the draft signs off with it.
  const { data: buyer } = await service
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', user.id)
    .maybeSingle();

  const buyerName =
    [buyer?.first_name, buyer?.last_name].filter(Boolean).join(' ').trim() || null;

  const draft = compose(inquiry, dealer.name, buyerName);

  // Recorded, but never as `sent`. Composing a draft is not a send: the buyer
  // may close the composer, and on a device with no mail app it never opens.
  const stamped = await service
    .from('inquiries')
    .update({ opened_at: new Date().toISOString() })
    .eq('id', inquiry.id);

  if (stamped.error) {
    console.error('inquiry-draft could not stamp opened_at', inquiry.id, stamped.error.message);
  }

  return json({ to: dealer.contact_email, ...draft });
});
