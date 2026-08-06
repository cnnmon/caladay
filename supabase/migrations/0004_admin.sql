-- Admin access for the moderation page (/admin).
-- Exactly one admin identity: a Supabase Auth user with this email.
-- Other authenticated users (if signups were ever enabled) match no
-- policy below and get nothing beyond anon access.

-- Read raw reports
create policy "admin read reports" on public.reports
  for select to authenticated
  using ((auth.jwt() ->> 'email') = 'cabbagetree876@gmail.com');

-- See every solution, including hidden ones and flagged names
create policy "admin read all solutions" on public.solutions
  for select to authenticated
  using ((auth.jwt() ->> 'email') = 'cabbagetree876@gmail.com');

-- Moderate: restore/mask names, hide/unhide entries
create policy "admin update solutions" on public.solutions
  for update to authenticated
  using ((auth.jwt() ->> 'email') = 'cabbagetree876@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'cabbagetree876@gmail.com');

grant select on public.reports to authenticated;
-- Column-level: moderation can only touch these three columns
grant update (username, flagged_name, hidden) on public.solutions to authenticated;
