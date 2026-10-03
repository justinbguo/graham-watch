/**
 * The one next step for a shop, so its row can say it instead of explaining
 * four columns of counts in a paragraph underneath.
 *
 * The order matters. A claimed shop is checked first because importing into
 * it is refused, whatever its counts say. A published shop is checked next:
 * stock still queued on a live shop is maintenance, not the reason to open it.
 */

export type StageInput = {
  permission: 'pending' | 'approved' | 'revoked';
  can_import: boolean;
  listings_held: number;
  catalog_queued: number;
};

export type Step = 'pick' | 'publish' | 'pull-back';

export type Stage = {
  label: string;
  /** Green when buyers can see the shop, brass when it waits on us. */
  tone: 'ok' | 'wait' | 'plain';
  /** The solid button. Pull back is never solid: it empties a buyer's deck. */
  primary: Step | null;
  /** Shown as a quiet button on the row, beside or instead of the primary. */
  quiet: Step | null;
};

export function stageOf(shop: StageInput): Stage {
  const held = Number(shop.listings_held);
  const queued = Number(shop.catalog_queued);
  const live = shop.permission === 'approved';

  if (!shop.can_import) {
    return live
      ? { label: 'Live · they manage it', tone: 'ok', primary: null, quiet: 'pull-back' }
      : { label: 'They manage it', tone: 'plain', primary: held > 0 ? 'publish' : null, quiet: null };
  }

  if (live) return { label: 'Live', tone: 'ok', primary: null, quiet: 'pull-back' };

  if (held === 0) return { label: 'Needs watches', tone: 'wait', primary: 'pick', quiet: null };

  if (queued > 0) {
    return { label: `${queued} still queued`, tone: 'wait', primary: 'pick', quiet: 'publish' };
  }

  return {
    label: shop.permission === 'revoked' ? 'Pulled back' : 'Ready to publish',
    tone: 'wait',
    primary: 'publish',
    quiet: null,
  };
}

export const STEP_LABEL: Record<Step, string> = {
  pick: 'Pick watches',
  publish: 'Publish',
  'pull-back': 'Pull back',
};

/** `12 in the deck · 40 imported · 79 for sale`, the three counts as one line. */
export function countsLine(shop: {
  listings_in_deck: number;
  listings_held: number;
  catalog_total: number;
}): string {
  return [
    `${Number(shop.listings_in_deck)} in the deck`,
    `${Number(shop.listings_held)} imported`,
    `${Number(shop.catalog_total)} for sale`,
  ].join(' · ');
}
