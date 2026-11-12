/**
 * Runs before expo-router/entry reads the address. The router otherwise writes
 * a token_hash back into the URL after we strip it, and a reload spends it again.
 */
type StashedEmailLink = {
  tokenHash: string | null;
  type: string | null;
  error: string | null;
};

declare global {
  interface Window {
    __grahamEmailLink?: StashedEmailLink;
  }
}

function takeEmailLink(params: URLSearchParams): StashedEmailLink | null {
  const tokenHash = params.get('token_hash');
  const type = params.get('type');
  const error = params.get('error_description') || params.get('error');
  if (!tokenHash && !error) return null;
  params.delete('token_hash');
  params.delete('type');
  params.delete('error');
  params.delete('error_description');
  params.delete('error_code');
  return { tokenHash, type, error };
}

if (typeof window !== 'undefined') {
  const url = new URL(window.location.href);
  const fromSearch = takeEmailLink(url.searchParams);
  const hash = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : '');
  const fromHash = takeEmailLink(hash);
  const found = fromSearch ?? fromHash;
  if (found) {
    window.__grahamEmailLink = {
      tokenHash: fromSearch?.tokenHash ?? fromHash?.tokenHash ?? null,
      type: fromSearch?.type ?? fromHash?.type ?? null,
      error: fromSearch?.error ?? fromHash?.error ?? null,
    };
    const hashString = hash.toString();
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${hashString ? `#${hashString}` : ''}`,
    );
  }
}

export {};
