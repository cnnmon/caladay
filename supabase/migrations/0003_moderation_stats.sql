-- Moderation v2: reports auto-mask the NAME only (times stay on the
-- board, so report-spam can't remove a competitor's score), plus an
-- aggregate stats function for CI monitoring.

-- Preserves the original name for review/restore when a name is masked.
alter table public.solutions add column flagged_name text;

-- Replace row-hiding with name-masking at 10 reports. The hidden column
-- remains for manual hard-hides from the dashboard.
create or replace function public.hide_reported_solution() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from reports where solution_id = new.solution_id) >= 10 then
    update solutions
      set flagged_name = username, username = '???'
      where id = new.solution_id and flagged_name is null;
  end if;
  return new;
end $$;

-- Public, harmless aggregates so CI can watch moderation activity without
-- read access to reports (which stays write-only for clients).
create function public.moderation_stats()
returns table (total_reports bigint, masked_names bigint, hidden_solutions bigint)
language sql security definer set search_path = public as $$
  select
    (select count(*) from reports),
    (select count(*) from solutions where flagged_name is not null),
    (select count(*) from solutions where hidden);
$$;

grant execute on function public.moderation_stats() to anon;
