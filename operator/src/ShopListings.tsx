import { useEffect, useState } from 'react';

import { formatPrice, photoUrl } from './importer';
import { supabase, type Database } from './supabase';

type Listing = Database['public']['Functions']['operator_listings']['Returns'][number];
type Problem = Database['public']['Functions']['operator_catalog_problems']['Returns'][number];

/**
 * One shop's watches, as imported.
 *
 * Both reads are RPCs: a pending shop's listings and catalogue rows are
 * readable only by whoever imported them, so an operator asking PostgREST for
 * them directly gets an empty list and a screen that looks broken.
 *
 * The problems list is here rather than hidden because seeding a deck from
 * forty shops means some of them read badly, and a shop reporting ten watches
 * against a catalogue of five hundred needs to be able to say why.
 */
export function ShopListings({ dealerId, reload }: { dealerId: string; reload: number }) {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [rows, bad] = await Promise.all([
        supabase.rpc('operator_listings', { p_dealer_id: dealerId }),
        supabase.rpc('operator_catalog_problems', { p_dealer_id: dealerId }),
      ]);

      if (!live) return;
      setError(rows.error?.message ?? bad.error?.message ?? null);
      setListings(rows.data ?? []);
      setProblems(bad.data ?? []);
    })();
    return () => {
      live = false;
    };
  }, [dealerId, reload]);

  if (error) return <p className="error">{error}</p>;
  if (listings === null) return <p className="muted">Loading…</p>;

  return (
    <div className="detail">
      {listings.length === 0 ? (
        <p className="muted">
          No watches imported yet. Use <strong>Import</strong> on the row above.
        </p>
      ) : (
        <table className="inner">
          <thead>
            <tr>
              <th />
              <th>Watch</th>
              <th className="num">Year</th>
              <th className="num">Size</th>
              <th className="num">Price</th>
              <th>Condition</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {listings.map((listing) => {
              const thumb = photoUrl(listing.thumb_path);
              const name = [listing.brand, listing.model].filter(Boolean).join(' ');

              return (
                <tr key={listing.id}>
                  <td className="thumb">
                    {thumb ? (
                      <img src={thumb} alt="" loading="lazy" />
                    ) : (
                      // A watch with no photo is never shown to a buyer, so this
                      // is a fault worth seeing rather than an empty square.
                      <span className="badge wait">no photo</span>
                    )}
                  </td>
                  <td>
                    <a href={listing.source_url ?? '#'} target="_blank" rel="noreferrer">
                      <strong>{name || 'unnamed'}</strong>
                    </a>
                    <br />
                    <span className="muted small">
                      {listing.reference ? `ref. ${listing.reference}` : 'no reference'}
                      {listing.photo_count > 1 ? ` · ${listing.photo_count} photos` : ''}
                    </span>
                  </td>
                  <td className="num">{listing.year ?? <span className="muted">—</span>}</td>
                  <td className="num">
                    {listing.case_size_mm ? `${listing.case_size_mm}mm` : <span className="muted">—</span>}
                  </td>
                  <td className="num">{formatPrice(listing.price_cents, listing.currency)}</td>
                  <td className="small">{listing.condition ?? <span className="muted">—</span>}</td>
                  <td>
                    {listing.sold_at ? (
                      <span className="badge wait">sold</span>
                    ) : listing.status === 'active' ? (
                      <span className="badge ok">active</span>
                    ) : (
                      <span className="badge wait">{listing.status}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {problems.length > 0 ? (
        <details className="problems">
          <summary>
            {problems.length} catalogue item(s) not imported
          </summary>
          <ul className="rows tight">
            {problems.map((problem) => (
              <li key={problem.id}>
                <a href={problem.source_url ?? '#'} target="_blank" rel="noreferrer">
                  {problem.title ?? problem.source_url}
                </a>
                <br />
                <span className={problem.error ? 'error small' : 'muted small'}>
                  {problem.error ?? 'queued, waiting on the next import'}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
