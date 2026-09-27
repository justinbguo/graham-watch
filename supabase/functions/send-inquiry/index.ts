import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

import { price, watchName, watchSubject, type MailListing } from '../_shared/listing-mail.ts';
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

type Inquiry = {
  id: string;
  message: string | null;
  status: string;
  dealer_id: string;
  listings: MailListing | null;
};

function signInUrl(): string {
  const origin = (Deno.env.get('APP_ORIGIN') ?? 'https://graham.app').replace(/\/$/, '');
  return `${origin}/sign-in`;
}

function compose(
  inquiry: Inquiry,
  dealerEmail: string,
  buyerEmail: string,
  buyerName: string | null,
  claimed: boolean
) {
  const listing = inquiry.listings!;
  const watch = watchName(listing);
  const details = [
    listing.reference ? `Reference ${listing.reference}` : null,
    price(listing.price_cents, listing.currency),
  ].filter(Boolean);

  // Discovery only. Ownership still requires signing in as this address and
  // tapping Claim on Profile — a link in forwarded mail must not take the shop.
  const claimFooter = claimed
    ? []
    : [
        '',
        'This watch is listed on Graham. Sign in with this address to claim the shop and update listings:',
        signInUrl(),
      ];

  return {
    to: dealerEmail,
    // The dealer answers the buyer, not us. Graham is out of the way after this.
    replyTo: buyerEmail,
    // Same line the buyer's own mail app puts there, so a dealer who gets both
    // sees one thread about one watch rather than two about "an Omega".
    subject: `Inquiry: ${watchSubject(listing)}`,
    text: [
      `${buyerName ?? 'A buyer'} on Graham is interested in your ${watch}.`,
      '',
      details.join(' · '),
      listing.source_url,
      '',
      inquiry.message ? `They wrote:\n\n"${inquiry.message}"\n` : 'They did not leave a message.',
      '',
      `Reply to this email to reach ${buyerName ?? 'them'} directly at ${buyerEmail}.`,
      ...claimFooter,
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
    .select('contact_email, claimed_by')
    .eq('id', inquiry.dealer_id)
    .maybeSingle();

  // The caller's own token cannot see this row through RLS after the service
  // role takes over, and a name signs the mail better than an address alone.
  const { data: buyer } = await service
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', user.id)
    .maybeSingle();

  const buyerName =
    [buyer?.first_name, buyer?.last_name].filter(Boolean).join(' ').trim() || null;

  if (!dealer?.contact_email) {
    await service.from('inquiries').update({ status: 'failed' }).eq('id', inquiry.id);
    return json({ error: 'We have no address for this dealer yet.' }, 422);
  }

  // The buyer's address is the entire point of the mail — it is the reply-to the
  // dealer answers. Sign-in methods that carry no email (phone, and Apple when a
  // user revokes the relay) would otherwise send "reach them at undefined" with
  // a reply-to nobody can answer, and we would record it as sent.
  if (!user.email) {
    await service.from('inquiries').update({ status: 'failed' }).eq('id', inquiry.id);
    return json({ error: 'Add an email to your profile before contacting a dealer.' }, 422);
  }

  // Claimed before the mail goes out, not after it comes back.
  //
  // Marking it afterwards read as the honest order — only report a send that
  // happened — but the write was never checked, so a lost update left the row
  // `pending` under a response that said `sent`. `recordIntent` hands a buyer
  // any row that is not `sent` back to retry, and the guard above lets a
  // `pending` row through, so the next tap mailed the dealer the same inquiry
  // again. An email cannot be recalled; a status can be corrected.
  //
  // `neq` makes the claim the lock as well: two invocations for one inquiry
  // cannot both win it, so neither can both send.
  const claimed = await service
    .from('inquiries')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', inquiry.id)
    .neq('status', 'sent')
    .select('id')
    .maybeSingle();

  if (claimed.error) {
    console.error('send-inquiry could not claim the inquiry', inquiry.id, claimed.error.message);
    return json({ error: 'Could not reach the dealer. Try again shortly.' }, 502);
  }

  // Another invocation claimed it between the read above and here.
  if (!claimed.data) return json({ status: 'sent' });

  try {
    await send(
      compose(
        inquiry,
        dealer.contact_email,
        user.email,
        buyerName,
        dealer.claimed_by != null
      )
    );
  } catch (error) {
    // Hand the row back so the buyer can try again. If this write is the thing
    // that is broken the row stays `sent` and the inquiry is stranded, which is
    // the failure to prefer: it needs a person, not a second email.
    const released = await service
      .from('inquiries')
      .update({ status: 'failed', sent_at: null })
      .eq('id', inquiry.id);
    if (released.error) {
      console.error('send-inquiry stranded an inquiry', inquiry.id, released.error.message);
    }
    console.error('send-inquiry failed', error);
    return json({ error: 'Could not reach the dealer. Try again shortly.' }, 502);
  }

  return json({ status: 'sent' });
});
