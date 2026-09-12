import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

import { send } from './mailer.ts';

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
  status: string;
  dealer_id: string;
  listings: {
    brand: string | null;
    model: string | null;
    reference: string | null;
    year: number | null;
    price_cents: number | null;
    currency: string | null;
    source_url: string;
  } | null;
};

function price(cents: number | null, currency: string | null): string {
  if (cents === null) return 'price on request';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency ?? 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function compose(inquiry: Inquiry, dealerEmail: string, buyerEmail: string) {
  const listing = inquiry.listings!;
  const watch = [listing.brand, listing.model].filter(Boolean).join(' ') || 'a watch';
  const details = [
    listing.reference ? `Reference ${listing.reference}` : null,
    listing.year ? `${listing.year}` : null,
    price(listing.price_cents, listing.currency),
  ].filter(Boolean);

  return {
    to: dealerEmail,
    // The dealer answers the buyer, not us. Graham is out of the way after this.
    replyTo: buyerEmail,
    subject: `Inquiry: ${watch}`,
    text: [
      `A buyer on Graham is interested in your ${watch}.`,
      '',
      details.join(' · '),
      listing.source_url,
      '',
      inquiry.message ? `They wrote:\n\n"${inquiry.message}"\n` : 'They did not leave a message.',
      '',
      `Reply to this email to reach them directly at ${buyerEmail}.`,
      '',
      '— Graham',
    ].join('\n'),
  };
}

async function loadInquiry(supabase: SupabaseClient, inquiryId: string, buyerId: string) {
  const { data, error } = await supabase
    .from('inquiries')
    .select(
      'id, message, status, dealer_id, ' +
        'listings ( brand, model, reference, year, price_cents, currency, source_url )'
    )
    .eq('id', inquiryId)
    .eq('buyer_id', buyerId)
    .maybeSingle();

  if (error) throw error;
  return data as Inquiry | null;
}

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

  // Reading through the caller's own token means RLS decides whether this
  // inquiry is theirs. The service role below only writes the outcome.
  const inquiry = await loadInquiry(supabase, inquiryId, user.id);
  if (!inquiry) return json({ error: 'No such inquiry.' }, 404);
  if (inquiry.status === 'sent') return json({ status: 'sent' });
  if (!inquiry.listings) return json({ error: 'That watch is gone.' }, 410);

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: dealer } = await service
    .from('dealers')
    .select('contact_email')
    .eq('id', inquiry.dealer_id)
    .maybeSingle();

  if (!dealer?.contact_email) {
    await service.from('inquiries').update({ status: 'failed' }).eq('id', inquiry.id);
    return json({ error: 'We have no address for this dealer yet.' }, 422);
  }

  try {
    await send(compose(inquiry, dealer.contact_email, user.email!));
  } catch (error) {
    await service.from('inquiries').update({ status: 'failed' }).eq('id', inquiry.id);
    console.error('send-inquiry failed', error);
    return json({ error: 'Could not reach the dealer. Try again shortly.' }, 502);
  }

  await service
    .from('inquiries')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', inquiry.id);

  return json({ status: 'sent' });
});
