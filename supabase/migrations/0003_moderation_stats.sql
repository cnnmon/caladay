-- Public, harmless aggregate so CI can watch moderation activity without
-- read access to reports (which stays write-only for clients).
create function public.moderation_stats()
returns table (total_reports bigint, hidden_solutions bigint)
language sql security definer set search_path = public as $$
  select
    (select count(*) from reports),
    (select count(*) from solutions where hidden);
$$;

grant execute on function public.moderation_stats() to anon;
