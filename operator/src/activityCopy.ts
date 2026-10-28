/**
 * One line for an audit row. The table stores a verb and two JSON objects;
 * the screen says what changed, in words, instead of dumping the objects.
 */

const VERBS: Record<string, string> = {
  approve_shop: 'Published a shop',
  resume_shop: 'Resumed a shop',
  pause_shop: 'Paused a shop',
  revoke_shop: 'Revoked a shop',
  set_shop_permission: 'Changed a shop’s permission',
  approve_application: 'Approved an application',
  decline_application: 'Declined an application',
  delete_listing: 'Deleted a watch',
  hide_listing: 'Hid a watch',
  show_listing: 'Showed a watch',
  mark_sold: 'Marked a watch sold',
  mark_available: 'Marked a watch available',
  edit_listing: 'Edited a watch',
  issue_claim_code: 'Issued a claim code',
  revoke_claim_code: 'Revoked a claim code',
  unclaim_shop: 'Unassigned a shop',
  delete_dealer: 'Deleted a shop',
};

export function actionLabel(action: string): string {
  return VERBS[action] ?? action.replaceAll('_', ' ');
}

export function changeSummary(before: unknown, after: unknown): string {
  if (!isRecord(before) && !isRecord(after)) return '';
  const left = isRecord(before) ? before : {};
  const right = isRecord(after) ? after : {};
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])];
  const lines = keys
    .filter((key) => stable(left[key]) !== stable(right[key]))
    .slice(0, 6)
    .map((key) => `${labelKey(key)}: ${show(left[key])} → ${show(right[key])}`);
  if (lines.length === 0 && after == null) return 'Removed';
  return lines.join(' · ');
}

function labelKey(key: string): string {
  return key.replaceAll('_', ' ');
}

function show(value: unknown): string {
  if (value == null) return '—';
  if (Array.isArray(value)) return value.length === 0 ? '—' : value.join(', ');
  if (typeof value === 'object') return '…';
  return String(value);
}

function stable(value: unknown): string {
  return JSON.stringify(value) ?? '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
