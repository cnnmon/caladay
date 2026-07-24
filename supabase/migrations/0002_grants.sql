-- Table privileges for the API roles (RLS still applies on top of these).
-- anon: read solutions (RLS filters hidden), file reports. No other writes.
grant usage on schema public to anon, authenticated, service_role;

grant select on public.solutions to anon, authenticated;
grant insert on public.reports to anon, authenticated;

-- reports.id is an identity column; inserts need the sequence
grant usage, select on all sequences in schema public to anon, authenticated;

-- The submit-solution edge function writes via service_role
grant all on public.solutions to service_role;
grant all on public.reports to service_role;
