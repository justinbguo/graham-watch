import { useCallback, useMemo, useRef, useState } from 'react';

import {
  useClaimableDealer,
  useRequestClaimCode,
  useVerifyClaimCode,
  type ClaimableDealer,
} from '@/data/dealers';
import { isLocalInbox, waitForLatestCode } from '@/lib/devInbox';

export type ClaimStep = 'site' | 'address' | 'code' | 'done';

/**
 * Proving you run a shop, in three answers: which site, which mailbox on it,
 * and the code that arrived there.
 *
 * The mailbox is the whole point. The signed-in account can be any address — a
 * dealer who reads info@theshop.com from a personal login is the common case —
 * so what gets proven is control of a mailbox at the shop's own domain, not the
 * address on the session.
 */
export function useShopClaim() {
  const [website, setWebsite] = useState('');
  const [dealer, setDealer] = useState<ClaimableDealer | null>(null);
  const [localPart, setLocalPart] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);

  const lookup = useClaimableDealer(website);
  const request = useRequestClaimCode();
  const verify = useVerifyClaimCode();
  const [readingInbox, setReadingInbox] = useState(false);
  const inboxWait = useRef(0);

  const step: ClaimStep = claimed ? 'done' : sentTo ? 'code' : dealer ? 'address' : 'site';

  // A found shop is only a candidate until it is confirmed, so the site step can
  // show a match without committing to it.
  const match = lookup.data ?? null;

  const addresses = useMemo(() => {
    if (!dealer) return { host: null, published: null };
    return { host: dealer.claim_host, published: dealer.contact_hint };
  }, [dealer]);

  const spendCode = useCallback(
    (value: string) => {
      if (!dealer || value.trim().length !== 6) return;
      verify.mutate({ dealerId: dealer.id, code: value }, { onSuccess: () => setClaimed(true) });
    },
    [dealer, verify]
  );

  const fillFromInbox = useCallback(
    (to: string, since: number) => {
      if (!isLocalInbox()) return;
      const mine = ++inboxWait.current;
      setReadingInbox(true);
      void waitForLatestCode(to, since)
        .then((token) => {
          if (mine !== inboxWait.current || !token) return;
          setCode(token);
          spendCode(token);
        })
        .finally(() => {
          if (mine === inboxWait.current) setReadingInbox(false);
        });
    },
    [spendCode]
  );

  const sendToDomain = useCallback(() => {
    if (!dealer || !addresses.host || !localPart.trim()) return;
    const email = `${localPart.trim()}@${addresses.host}`;
    const since = Date.now();
    request.mutate(
      { dealerId: dealer.id, email },
      {
        onSuccess: (result) => {
          setSentTo(result.sentTo);
          fillFromInbox(email, since);
        },
      }
    );
  }, [addresses.host, dealer, fillFromInbox, localPart, request]);

  const sendToPublished = useCallback(() => {
    if (!dealer) return;
    // No address in the body: the server reads the shop's own contact address so
    // the client never has to hold it. Mailpit matching uses the masked form.
    const since = Date.now();
    request.mutate(
      { dealerId: dealer.id },
      {
        onSuccess: (result) => {
          setSentTo(result.sentTo);
          fillFromInbox(result.sentTo, since);
        },
      }
    );
  }, [dealer, fillFromInbox, request]);

  const submitCode = useCallback(() => {
    spendCode(code);
  }, [code, spendCode]);

  const startOver = useCallback(() => {
    inboxWait.current += 1;
    setSentTo(null);
    setCode('');
    setReadingInbox(false);
    verify.reset();
    request.reset();
  }, [request, verify]);

  return {
    step,
    website,
    setWebsite,
    match,
    searching: lookup.isFetching,
    dealer,
    confirmDealer: setDealer,
    addresses,
    localPart,
    setLocalPart,
    sendToDomain,
    sendToPublished,
    sending: request.isPending,
    sentTo,
    code,
    setCode,
    submitCode,
    verifying: verify.isPending,
    readingInbox,
    startOver,
    error: request.error?.message ?? verify.error?.message ?? lookup.error?.message ?? null,
  };
}
