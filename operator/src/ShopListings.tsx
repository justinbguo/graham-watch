import { useEffect, useState } from 'react';

import { deleteListing, formatPrice, photoUrl } from './importer';
import { confirmWrite, supabase, type Database } from './supabase';

type Listing = Database['public']['Functions']['operator_listings']['Returns'][number];
type Problem = Database['public']['Functions']['operator_catalog_problems']['Returns'][number];

/**
 * One shop's watches, as imported. What the scrape read about the shop itself
 * — its mark, its description, its Instagram — is on the row above rather than
 * in here: those are three facts about the shop, and a column can be scanned
 * down a list of forty of them.
 *
 * Both reads are RPCs: a pending shop's listings and catalogue rows are
 * readable only by whoever imported them, so an operator asking PostgREST for
 * them directly gets an empty list and a screen that looks broken.
 *
 * The problems list is here rather than hidden because seeding a deck from
 * forty shops means some of them read badly, and a shop reporting ten watches
 * against a catalogue of five hundred needs to be able to say why.
 */
export function ShopListings({
  dealerId,
  reload,
  onChanged,
}: {
  dealerId: string;
  reload: number;
  /** A delete changes the counts on the shop's row above, not just this list. */
  onChanged: () => void;
}) {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

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

  /**
   * Deleting is permanent and takes a buyer's saved watch with it, so the
   * question names what goes rather than asking "are you sure".
   */
  async function remove(listing: Listing) {
    const name = [listing.brand, listing.model].filter(Boolean).join(' ') || 'this watch';
    const losses = [
      listing.saved_count > 0 ? `${listing.saved_count} on wishlists` : '',
      listing.inquiry_count > 0 ? `${listing.inquiry_count} inquiry(s)` : '',
    ].filter(Boolean);

    const asked = [
      `Delete ${name} and its photographs for good?`,
      losses.length ? `This also deletes ${losses.join(' and ')}.` : '',
      "The shop's catalogue keeps it, so it can be imported again.",
    ]
      .filter(Boolean)
      .join('\n\n');

    if (!confirmWrite(asked)) return;

    setRemoving(listing.id);
    setError(null);
    try {
      await deleteListing(listing.id);
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete that watch.');
    } finally {
      setRemoving(null);
    }
  }

  if (error) return <p className="error">{error}</p>;
  if (listings === null) return <p className="muted">Loading…</p>;

  return (
    <div className="detail">
      {listings.length === 0 ? (
        <p className="muted">
          No watches imported yet. Use <strong>Add watches</strong> on the row above.
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
              <th>Description</th>
              <th>State</th>
              <th />
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
                  <td className="small prose">
                    {listing.description ? (
                      // The full text on hover: the cell clamps to two lines so
                      // one long import cannot set the height of every row.
                      <span title={listing.description}>{listing.description}</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {listing.sold_at ? (
                      <span className="badge wait">sold</span>
                    ) : listing.status === 'active' ? (
                      <span className="badge ok">active</span>
                    ) : (
                      <span className="badge wait">{listing.status}</span>
                    )}
                    {listing.saved_count > 0 ? (
                      <>
                        <br />
                        <span className="muted small">{listing.saved_count} on wishlists</span>
                      </>
                    ) : null}
                  </td>

                  <td className="actions">
                    <button
                      className="ghost"
                      disabled={removing !== null}
                      title="Delete this watch and its photographs for good"
                      onClick={() => void remove(listing)}>
                      {removing === listing.id ? 'Deleting…' : 'Delete'}
                    </button>
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
