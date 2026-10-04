import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

import { TIMEOUT } from './timeouts.ts';

export type Email = {
  to: string;
  replyTo: string;
  subject: string;
  text: string;
};

/**
 * Resend in production; the local Mailpit inbox otherwise. Both are real sends —
 * a "pretend" local path would let a broken template ship unnoticed.
 */
export async function send(email: Email): Promise<void> {
  const from = Deno.env.get('INQUIRY_FROM') ?? 'Graham <inquiries@graham.watch>';
  const apiKey = Deno.env.get('RESEND_API_KEY');

  if (apiKey) return sendViaResend(email, from, apiKey);
  return sendViaSmtp(email, from);
}

async function sendViaResend(email: Email, from: string, apiKey: string): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email.to],
      reply_to: email.replyTo,
      subject: email.subject,
      text: email.text,
    }),
    signal: AbortSignal.timeout(TIMEOUT.mail),
  });

  if (!response.ok) {
    throw new Error(`Resend refused the message (${response.status}): ${await response.text()}`);
  }
}

function deadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: number;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Mail server did not answer within ${ms}ms.`)), ms);
  });
  return Promise.race([work, expired]).finally(() => clearTimeout(timer));
}

async function sendViaSmtp(email: Email, from: string): Promise<void> {
  const hostname = Deno.env.get('SMTP_HOST');
  if (!hostname) {
    throw new Error('No mail provider. Set RESEND_API_KEY, or SMTP_HOST for local testing.');
  }

  const client = new SMTPClient({
    connection: {
      hostname,
      port: Number(Deno.env.get('SMTP_PORT') ?? 25),
      tls: false,
    },
    // Mailpit speaks plaintext and does not implement STARTTLS. With tls off,
    // denomailer sends STARTTLS anyway, Mailpit answers 500, and the client
    // waits until the runtime kills the function. The inquiry is already
    // marked sent by then, so the next tap reports success and never mails.
    debug: { allowUnsecure: true, noStartTLS: true },
  });

  try {
    await deadline(
      client.send({
        from,
        to: email.to,
        replyTo: email.replyTo,
        subject: email.subject,
        content: email.text,
      }),
      TIMEOUT.mail,
    );
  } finally {
    // close() throws on a connection that never opened, which would replace the
    // error that stopped us connecting in the first place.
    try {
      await client.close();
    } catch {
      // already closed
    }
  }
}
