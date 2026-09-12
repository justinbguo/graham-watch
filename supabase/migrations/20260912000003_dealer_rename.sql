-- Dealers had no update policy, so a dealer imported before we could read the
-- shop's real name kept its hostname on every card forever.
--
-- Letting the importer fix the name must not let anyone approve a dealer. A
-- policy cannot express that: policies choose rows, not columns. Column
-- privileges are the mechanism, so permission is simply not grantable here.
revoke update on public.dealers from authenticated;
grant update (name, contact_email) on public.dealers to authenticated;

create policy "importers may correct dealers they added"
on public.dealers for update to authenticated
using (created_by = (select auth.uid()))
with check (created_by = (select auth.uid()));
