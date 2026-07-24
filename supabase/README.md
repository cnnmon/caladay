# Supabase setup (one-time)

The backend is a Supabase project: two tables + RLS + one edge function that
validates leaderboard submissions server-side.

## 1. Create the project (either of you)

1. supabase.com → create an **organization** (free plan) → invite the other
   person as a member (Organization settings → Members).
2. Create a project in it (any region close to you; note the database
   password somewhere safe).

## 2. Create the schema and import the old data

In the dashboard **SQL Editor**, run in order:

1. `supabase/migrations/0001_init.sql` (tables, RLS, report trigger)
2. `supabase/seed_convex_import.sql` (all 460 solutions exported from Convex
   on 2026-07-24; original ids preserved so players' local "(you)" markers
   keep working. Raw backup: `backups/convex-export-2026-07-24.json`)

## 3. Deploy the edge function

```sh
npx supabase login          # opens browser
npx supabase link --project-ref <PROJECT_REF>   # ref is in the dashboard URL
npx supabase functions deploy submit-solution
```

(No secrets to configure — the function uses the automatically-provided
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.)

## 4. Wire up the clients

From dashboard → Settings → API, copy the **Project URL** and **anon public
key** into:

- `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- Vercel → project → Settings → Environment Variables (same two vars) —
  BEFORE pushing this branch, or the deployed site will build without a
  backend. The old `NEXT_PUBLIC_CONVEX_URL` var can be deleted.

Then rebuild the iOS bundle (`npm run ios:sync`) — the static export bakes
these env vars in at build time.
