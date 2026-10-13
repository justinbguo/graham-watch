import { useCallback, useMemo, useRef, useState } from 'react';

import {
  useMyApplication,
  useRequestApplicationCode,
  useSubmitApplication,
  useVerifyApplicationCode,
  type ListingVolume,
} from '@/data/applications';
import { isLocalInbox, waitForLatestCode } from '@/lib/devInbox';

export type ApplyStep = 'form' | 'verify' | 'done';

/** "Heuer, Universal Genève , omega" is three brands, not one string. */
function parseBrands(input: string): string[] {
  const seen = new Set<string>();
  return input
    .split(',')
    .map((brand) => brand.trim())
    .filter((brand) => {
      if (!brand) return false;
      const key = brand.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * Applying to list a shop we have never read, in two answers: what the shop is,
 * and a mailbox on its own domain.
 *
 * The mailbox proves the application came from the shop. It grants nothing —
 * there is no shop row to own yet — so an operator still reads every one.
 */
export function useShopApplication(initialWebsite = '') {
  const existing = useMyApplication();
  const submit = useSubmitApplication();
  const request = useRequestApplicationCode();
  const verify = useVerifyApplicationCode();

  const [shopName, setShopName] = useState('');
  const [website, setWebsite] = useState(initialWebsite);
  const [brandsInput, setBrandsInput] = useState('');
  const [volume, setVolume] = useState<ListingVolume>('10_to_50');
  const [filedId, setFiledId] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [localPart, setLocalPart] = useState('');
  const [code, setCode] = useState('');
  const [readingInbox, setReadingInbox] = useState(false);
  const inboxWait = useRef(0);

  // A reload mid-flow must not lose the application. The server copy wins,
  // because it is the one an operator can see.
  const application = existing.data ?? null;
  const applicationId = filedId ?? application?.id ?? null;
  const verified = Boolean(application?.verified_at);
  const host = application?.claim_host ?? null;

  const brands = useMemo(() => parseBrands(brandsInput), [brandsInput]);

  const step: ApplyStep = verified ? 'done' : applicationId ? 'verify' : 'form';

  const file = useCallback(() => {
    if (!shopName.trim() || !website.trim()) return;
    submit.mutate(
      { shopName, website, brands, volume },
      { onSuccess: setFiledId }
    );
  }, [brands, shopName, submit, volume, website]);

  const spendCode = useCallback(
    (value: string) => {
      if (!applicationId || value.trim().length !== 6) return;
      verify.mutate({ applicationId, code: value });
    },
    [applicationId, verify]
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

  const sendCode = useCallback(() => {
    if (!applicationId || !host || !localPart.trim()) return;
    const email = `${localPart.trim()}@${host}`;
    const since = Date.now();
    request.mutate(
      { applicationId, email },
      {
        onSuccess: (result) => {
          setSentTo(result.sentTo);
          fillFromInbox(email, since);
        },
      }
    );
  }, [applicationId, fillFromInbox, host, localPart, request]);

  const startOver = useCallback(() => {
    inboxWait.current += 1;
    setSentTo(null);
    setCode('');
    setReadingInbox(false);
    request.reset();
    verify.reset();
  }, [request, verify]);

  return {
    step,
    application,
    isLoading: existing.isLoading,
    shopName,
    setShopName,
    website,
    setWebsite,
    brandsInput,
    setBrandsInput,
    brands,
    volume,
    setVolume,
    file,
    filing: submit.isPending,
    host,
    localPart,
    setLocalPart,
    sendCode,
    sending: request.isPending,
    sentTo,
    code,
    setCode,
    submitCode: () => spendCode(code),
    verifying: verify.isPending,
    readingInbox,
    startOver,
    error:
      submit.error?.message ??
      request.error?.message ??
      verify.error?.message ??
      existing.error?.message ??
      null,
  };
}
