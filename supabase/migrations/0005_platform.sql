-- Record which platform a solve came from (web has keyboard shortcuts,
-- so times aren't strictly comparable). Absent on pre-1.0.1 rows.
alter table public.solutions
  add column platform text check (platform in ('web', 'ios'));

-- anon select is column-scoped; expose the new column
grant select (platform) on public.solutions to anon;
