/**
 * Ties an inquiry to the watch it is actually about.
 *
 * The old check read `buyer_id = auth.uid() and status = 'pending'` and said
 * nothing about the other two columns, so a caller could post any `listing_id`
 * with any `dealer_id`. The mail goes to whichever dealer the row names, which
 * made the row a way to send a stranger's shop an inquiry about a watch they
 * have never seen.
 *
 * It also settles what may be asked about at all: a watch reaches the deck only
 * when it is active, unsold, and its shop is approved, and those are the same
 * conditions under which the app offers the button. Enforcing them here means a
 * revoked shop stops receiving mail the moment it is revoked.
 *
 * The target table is named in full inside the subquery on purpose. Writing
 * `l.dealer_id = dealer_id` would resolve the bare name against `listings` in
 * the subquery's own FROM clause — a column compared with itself, true for
 * every row, and a policy that checks nothing.
 */
drop policy "buyers create their own inquiries" on public.inquiries;

create policy "buyers create their own inquiries"
on public.inquiries for insert to authenticated
with check (
  buyer_id = (select auth.uid())
  and status = 'pending'
  and exists (
    select 1
    from public.listings l
    join public.dealers d on d.id = l.dealer_id
    where l.id = inquiries.listing_id
      and l.dealer_id = inquiries.dealer_id
      and l.status = 'active'
      and l.sold_at is null
      and d.permission = 'approved'
  )
);
