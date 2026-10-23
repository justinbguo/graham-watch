import { useState } from 'react';

import { draftFrom, editsFrom, isEdits, type ListingDraft } from './listingDraft';
import { confirmWrite, supabase, type Database } from './supabase';

type Listing = Database['public']['Functions']['operator_listings']['Returns'][number];

/**
 * The same fields a dealer corrects on their own watch. Saving goes through
 * operator_edit_listing, which writes the row without the refresh flag, so
 * edited_fields records the change and the nightly job leaves it alone.
 */
export function ListingEditor({
  listing,
  onClose,
  onSaved,
}: {
  listing: Listing;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<ListingDraft>(() => draftFrom(listing));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof ListingDraft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  async function save() {
    const edits = editsFrom(draft);
    if (!isEdits(edits)) {
      setError(edits.error);
      return;
    }
    const name = [listing.brand, listing.model].filter(Boolean).join(' ') || 'this watch';
    if (!confirmWrite(`Save corrections to ${name}? A refresh will leave the fields you changed.`)) return;

    setSaving(true);
    setError(null);
    // A blank field is omitted. The function's default is null, which is how
    // "we do not know the year" is stored. Sending null itself is rejected by
    // the generated client types, which treat an optional argument as a
    // missing key rather than a nullable one.
    const { error: failed } = await supabase.rpc('operator_edit_listing', {
      p_listing_id: listing.id,
      p_brand: edits.p_brand,
      ...(edits.p_model != null ? { p_model: edits.p_model } : {}),
      ...(edits.p_reference != null ? { p_reference: edits.p_reference } : {}),
      ...(edits.p_year != null ? { p_year: edits.p_year } : {}),
      ...(edits.p_case_size_mm != null ? { p_case_size_mm: edits.p_case_size_mm } : {}),
      ...(edits.p_price_cents != null ? { p_price_cents: edits.p_price_cents } : {}),
      ...(edits.p_condition != null ? { p_condition: edits.p_condition } : {}),
      ...(edits.p_description != null ? { p_description: edits.p_description } : {}),
    });
    setSaving(false);
    if (failed) {
      setError(failed.message);
      return;
    }
    onSaved();
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="editor"
        role="dialog"
        aria-labelledby="edit-watch-title"
        onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Edit watch</p>
            <h2 id="edit-watch-title">{[listing.brand, listing.model].filter(Boolean).join(' ') || 'Unnamed'}</h2>
          </div>
          <button className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="muted small">
          {listing.edited_fields.length
            ? `Already corrected by hand: ${listing.edited_fields.join(', ')}. A refresh leaves those, and anything you change now, alone.`
            : 'Anything you change stops following the shop’s site. Everything else keeps updating on each refresh.'}
          {listing.currency ? ` Price is in ${listing.currency}.` : ''}
        </p>
        {error ? <p className="error">{error}</p> : null}
        <div className="fields">
          <label>
            Brand
            <input value={draft.brand} onChange={(event) => set('brand', event.target.value)} />
          </label>
          <label>
            Model
            <input value={draft.model} onChange={(event) => set('model', event.target.value)} />
          </label>
          <label>
            Reference
            <input value={draft.reference} onChange={(event) => set('reference', event.target.value)} />
          </label>
          <label>
            Year
            <input value={draft.year} inputMode="numeric" onChange={(event) => set('year', event.target.value)} />
          </label>
          <label>
            Size (mm)
            <input value={draft.size} inputMode="decimal" onChange={(event) => set('size', event.target.value)} />
          </label>
          <label>
            Price
            <input value={draft.price} inputMode="decimal" onChange={(event) => set('price', event.target.value)} />
          </label>
          <label>
            Condition
            <input value={draft.condition} onChange={(event) => set('condition', event.target.value)} />
          </label>
          <label className="span">
            Description
            <textarea
              rows={4}
              value={draft.description}
              onChange={(event) => set('description', event.target.value)}
            />
          </label>
        </div>
        <div className="modal-footer">
          <button className="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
