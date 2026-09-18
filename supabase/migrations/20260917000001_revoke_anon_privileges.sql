/**
 * Takes back the privileges anon holds by default, and closes the operator gate
 * that stood open behind them.
 *
 * One Postgres detail is behind this. Supabase ships `alter default privileges
 * in schema public grant execute on functions to anon, authenticated,
 * service_role`, so every function created here is executable by anon the
 * moment it exists. Earlier migrations wrote `revoke execute ... from public`
 * and treated that as the gate, but PUBLIC is the implicit everyone-grant, not
 * the anon role — those revokes dropped a privilege anon was never using and
 * left anon's own grant untouched.
 *
 * Tables came through it unharmed, because row-level security denies a role
 * with no policy. Functions have no such backstop: a `security definer`
 * function runs as its owner and skips RLS by design. Checked against the local
 * stack holding nothing but the publishable key, with no account at all:
 * `operator_dealers()` returned every shop's `contact_email`, and
 * `set_dealer_permission()` moved a pending shop to approved.
 */

-- authenticated and service_role keep their grants. anon keeps nothing: no
-- screen before sign-in calls an RPC.
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- Writes, too. RLS already refuses anon on every table, so this changes no
-- behaviour today; it means a future `create policy ... to anon` cannot quietly
-- become a write path.
revoke insert, update, delete, truncate on all tables in schema public from anon;
alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon;

/**
 * The operator gate no longer trusts a caller that has no subject.
 *
 * The old body returned early whenever `auth.uid()` was null, reasoning that
 * only the service key has no subject. anon has no subject either, and the
 * grants above proved it could reach these functions — so that early return was
 * the bypass, not a shortcut around one.
 *
 * PostgREST publishes the key's role in `request.jwt.claims`, which is the one
 * signal that separates the service key from anon. It is unset in a direct psql
 * session, which is a migration or a superuser and has nothing to gate.
 */
create or replace function public.require_operator()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  request_role text :=
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
begin
  if request_role is null or request_role = 'service_role' then return; end if;

  if not public.is_operator() then
    raise exception 'Operators only.' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.require_operator() from public, anon;
grant execute on function public.require_operator() to authenticated, service_role;

/**
 * The claim check stops doubling as a lookup oracle.
 *
 * `can_claim_with_email` answers whether a guessed address matches a shop's
 * `contact_email` — the column `20260912000007_dealer_contact_privacy.sql`
 * revoked SELECT on, precisely so buyers cannot harvest dealer addresses. One
 * request per guess confirmed an address, and with anon holding execute the
 * publishable key in the app binary was enough to ask. Neither function has a
 * caller outside `store_dealer_claim_code` and `store_application_claim_code`,
 * which are definer functions and need no grant of their own.
 */
revoke execute on function public.can_claim_with_email(uuid, text) from public, anon, authenticated;
revoke execute on function public.can_verify_application(uuid, text) from public, anon, authenticated;
