alter table public.import_jobs
  add column catalog_read_at timestamptz;

update public.import_jobs
set status = 'failed',
    error = 'abandoned parked read',
    finished_at = now()
where status = 'running'
  and resume_page is null;

alter table public.import_jobs
  add constraint import_jobs_running_has_page
  check (status <> 'running' or resume_page is not null);
