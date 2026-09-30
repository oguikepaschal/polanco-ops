@AGENTS.md

## Database migrations

Never change the production database by hand in the Supabase SQL editor — no
schema, RLS policy, grant, function or storage-policy changes. Hand-applied SQL
is how production drifted from this repo before: fixes were reported as run but
never landed, and the migration history fell out of sync.

- Every database change is a new file in `supabase/migrations/`, named
  `YYYYMMDDHHMMSS_short_description.sql`, merged through a PR.
- `.github/workflows/supabase-migrations.yml` runs `supabase db push` on every
  merge to `main` that touches `supabase/migrations/`. After merging, check that
  the "Apply Supabase migrations" run in the Actions tab is green.
- Write migrations so they are safe to run twice: `if not exists`,
  `create or replace`, `drop ... if exists`.
- Never edit a migration that has already been merged — add a new one.
- Emergency hotfix only: if SQL must run in the SQL editor first, the identical
  SQL still lands as a migration file, and the workflow is then run manually
  (Actions → Apply Supabase migrations → Run workflow) with that version in
  `mark_applied`, so it is recorded instead of replayed.
