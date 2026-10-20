-- Deal tab reads the catalogue from website. Shop owners set it on Profile;
-- importers already wrote it at import time.
grant update (website) on public.dealers to authenticated;
