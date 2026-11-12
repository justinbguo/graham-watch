alter table public.source_items drop constraint source_items_hold_reason_check;

alter table public.source_items
  add constraint source_items_hold_reason_check
  check (
    hold_reason is null
    or hold_reason in ('strap', 'accessory', 'clock', 'not_a_watch')
  );

comment on column public.source_items.hold_reason is
  'Why this catalogue row is not published. strap, accessory, and clock are parts and other shop goods. not_a_watch is a pocket watch, money-clip watch, empty case, or movement-only part. Null means the row may be published.';
