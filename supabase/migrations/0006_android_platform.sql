-- Allow solves from the Android app. Run before deploying the
-- submit-solution function that records "android".
-- No "if exists": if the constraint has another name, fail loudly rather
-- than leave the old check in place to reject Android solves.
alter table public.solutions
  drop constraint solutions_platform_check;

alter table public.solutions
  add constraint solutions_platform_check
  check (platform in ('web', 'ios', 'android'));
