-- Based on a dump of production's pg_policies / grants (29 Sep 2026). RLS is
-- already enabled on every public table; this migration only closes the
-- holes that dump showed and leaves every other policy as it is.
--
-- 1. profiles_update_own let any signed-in user UPDATE their own profiles row
--    with no column restriction — including `role`. Any staff member could
--    promote themselves to admin from the browser console. Nothing in the app
--    updates a user's own profile; role changes now go through
--    /api/admin/staff-role (service role, after requireAdmin()), and the
--    invite flow already writes full_name with the service role. Dropped.
drop policy if exists "profiles_update_own" on public.profiles;

-- 2. settings is now written only by /api/admin/settings (service role, with
--    server-side validation). Removing the direct admin UPDATE policy means
--    the validated route is the only write path. (There was never an INSERT
--    policy, so the client-side upsert this replaces couldn't create a
--    missing key at all.)
drop policy if exists "settings_update" on public.settings;

-- 3. Supabase's default privileges gave anon every privilege on every
--    public table, and all existing policies are scoped TO public — so RLS
--    predicates were the only thing between the anon key and these tables,
--    and any future `using (true)` policy would have exposed a table to the
--    internet. anon's only legitimate reads are the two showcase views (which
--    run with owner privileges and don't need base-table grants); the public
--    lead endpoint uses the service role. Revoke everything.
revoke all on
  public.profiles,
  public.cars,
  public.car_images,
  public.leads,
  public.deal_sheets,
  public.settings,
  public.activity_log
from anon;
