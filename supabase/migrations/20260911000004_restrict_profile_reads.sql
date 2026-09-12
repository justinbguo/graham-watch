-- Reads were open to every signed-in user, which let anyone holding the anon key
-- enumerate every profile. Nothing in the app needs another user's profile:
-- cards show the dealer's name, never the importer's. Widen this again only
-- alongside a feature that actually displays someone else.
drop policy "profiles are readable when signed in" on public.profiles;

create policy "own profile is readable"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);
