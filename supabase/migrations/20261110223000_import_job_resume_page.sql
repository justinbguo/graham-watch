-- The page an operator import or inspect should read next.
-- One call reads one Shopify page. The next call with the same body
-- continues here, and an upsert on the product id keeps a retry from
-- inserting a second listing. Null means the read is not parked mid-feed.

alter table public.import_jobs
  add column resume_page integer;

comment on column public.import_jobs.resume_page is
  'Next Shopify page for a running read. Null once the feed has ended.';
