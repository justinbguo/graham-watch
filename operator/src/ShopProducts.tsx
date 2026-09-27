import { useMemo, useState } from 'react';

import { formatPrice, type Preview, type PreviewProduct } from './importer';

/**
 * Everything a shop publishes, one row each, before we take the shop on.
 *
 * The count on the row above comes from a sitemap and counts URLs, which for a
 * vintage dealer is mostly watches they sold years ago — 970 listed against 87
 * for sale is normal, not a fault. No single number distinguishes those, so
 * this is the table: every product, the shop's own fields on it, and whether a
 * catalogue read would keep it.
 */

type Filter = 'for sale' | 'sold' | 'refused' | 'all';

const FILTERS: Filter[] = ['for sale', 'sold', 'refused', 'all'];

function matches(product: PreviewProduct, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'refused') return product.skipped !== null;
  if (filter === 'sold') return product.skipped === null && !product.available;
  return product.skipped === null && product.available;
}

/** A date, not a timestamp: nobody here cares what hour a watch was published. */
function day(stamp: string | null): string {
  if (!stamp) return '—';
  const at = new Date(stamp);
  return Number.isNaN(at.getTime()) ? '—' : at.toISOString().slice(0, 10);
}

type SortKey = 'title' | 'price' | 'photos' | 'published';

/** Nulls last in both directions: an unknown is not cheaper than $500. */
function compare(a: PreviewProduct, b: PreviewProduct, key: SortKey): number {
  if (key === 'title') return a.title.localeCompare(b.title);
  if (key === 'photos') return a.photo_count - b.photo_count;

  const [left, right] =
    key === 'price'
      ? [a.price_cents, b.price_cents]
      : [
          a.published_at ? Date.parse(a.published_at) : null,
          b.published_at ? Date.parse(b.published_at) : null,
        ];

  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

export function ShopProducts({ preview }: { preview: Preview }) {
  const [filter, setFilter] = useState<Filter>('for sale');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; down: boolean } | null>(null);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = preview.listings.filter(
      (product) =>
        matches(product, filter) &&
        (!needle ||
          [product.title, product.vendor, product.sku, product.product_type]
            .filter(Boolean)
            .some((field) => field!.toLowerCase().includes(needle)))
    );

    if (!sort) return rows;
    // toSorted would be the obvious call; filter already made a copy.
    return rows.sort((a, b) => (sort.down ? -1 : 1) * compare(a, b, sort.key));
  }, [preview, filter, query, sort]);

  const heading = (key: SortKey, label: string, className?: string) => (
    <th className={className}>
      <button
        className="sort"
        onClick={() =>
          setSort((was) => (was?.key === key ? { key, down: !was.down } : { key, down: false }))
        }>
        {label}
        {sort?.key === key ? (sort.down ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  );

  return (
    <div className="detail">
      <div className="bar">
        <div className="tabs">
          {FILTERS.map((one) => (
            <button
              key={one}
              className={filter === one ? 'tab on' : 'tab'}
              onClick={() => setFilter(one)}>
              {one} ({count(preview, one)})
            </button>
          ))}
        </div>

        <input
          className="search push"
          value={query}
          placeholder="Filter by title, brand, SKU or type"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {shown.length === 0 ? (
        <p className="muted small">Nothing matches.</p>
      ) : (
        <table className="inner">
          <thead>
            <tr>
              <th />
              {heading('title', 'Product')}
              <th>Brand</th>
              <th>Type</th>
              {heading('price', 'Price', 'num')}
              <th>SKU</th>
              {heading('photos', 'Photos', 'num')}
              {heading('published', 'Published')}
              <th>Updated</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((product) => (
              <tr key={product.source_url} className={product.skipped ? 'dim' : undefined}>
                <td className="thumb">
                  {product.photo_url ? (
                    <img src={product.photo_url} alt="" loading="lazy" />
                  ) : (
                    <span className="badge wait">none</span>
                  )}
                </td>

                <td>
                  <a href={product.source_url} target="_blank" rel="noreferrer">
                    {product.title || product.source_url}
                  </a>
                </td>

                <td className="small">{product.vendor ?? <span className="muted">—</span>}</td>
                <td className="small">
                  {product.product_type ?? <span className="muted">—</span>}
                </td>
                <td className="num">{formatPrice(product.price_cents, product.currency)}</td>
                <td className="small">{product.sku ?? <span className="muted">—</span>}</td>
                <td className="num">{product.photo_count}</td>
                <td className="small muted">{day(product.published_at)}</td>
                <td className="small muted">{day(product.updated_at)}</td>

                <td>
                  {product.skipped ? (
                    <span className="badge wait" title={product.skipped}>
                      refused
                    </span>
                  ) : product.available ? (
                    <span className="badge ok">for sale</span>
                  ) : (
                    <span className="badge">sold</span>
                  )}
                  {product.skipped ? (
                    <>
                      <br />
                      <span className="muted small">{product.skipped}</span>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function count(preview: Preview, filter: Filter): number {
  if (filter === 'all') return preview.counts.read;
  if (filter === 'refused') return preview.counts.skipped;
  return filter === 'sold' ? preview.counts.sold : preview.counts.for_sale;
}
