-- Caladay schema: leaderboard solutions + UGC reports.
-- Run this in the Supabase SQL editor (or via supabase db push) before the seed.

create table public.solutions (
  id text primary key default gen_random_uuid()::text,
  username text not null,
  grid text not null,
  day text not null,
  started_at timestamptz,
  time_elapsed double precision,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index solutions_by_day on public.solutions (day);

create table public.reports (
  id bigint generated always as identity primary key,
  solution_id text not null references public.solutions (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index reports_by_solution on public.reports (solution_id);

alter table public.solutions enable row level security;
alter table public.reports enable row level security;

-- Anyone can read non-hidden solutions. Inserts happen only through the
-- submit-solution edge function (service role), which validates the grid
-- server-side; there is no direct write access for anon clients.
create policy "read non-hidden solutions" on public.solutions
  for select using (hidden = false);

-- Anyone can file a report (App Store Guideline 1.2); nobody can read them.
create policy "insert reports" on public.reports
  for insert with check (true);

-- Auto-hide a solution once it accumulates 3 reports.
-- Note: with no auth there is no way to dedupe reporters server-side; the
-- client dedupes locally. Abuse can only hide entries (fail-safe for content
-- moderation), never expose anything.
create function public.hide_reported_solution() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from reports where solution_id = new.solution_id) >= 3 then
    update solutions set hidden = true where id = new.solution_id;
  end if;
  return new;
end $$;

create trigger reports_auto_hide
  after insert on public.reports
  for each row execute function public.hide_reported_solution();
