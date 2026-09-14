/**
 * Makes `import_jobs` a ledger the account it bills cannot edit.
 *
 * Reading a shop costs a scrape credit and, off the adapter path, an OpenAI
 * call. The only record of who spent that is this table, and the old policy was
 * `for all`, so the spender could delete their own rows. A budget an attacker
 * can reset is not a budget.
 *
 * Writes move to the service role inside the import function. Authenticated
 * accounts keep the read, because a dealer should still see the history of
 * their own refreshes.
 */
drop policy "import jobs are private" on public.import_jobs;

create policy "own import jobs are readable"
on public.import_jobs for select to authenticated
using (user_id = (select auth.uid()));

-- The rate limit counts a user's recent rows on every priced action, so it gets
-- an index rather than a sequential scan of every import ever run.
create index import_jobs_actor_idx on public.import_jobs (user_id, created_at desc);
