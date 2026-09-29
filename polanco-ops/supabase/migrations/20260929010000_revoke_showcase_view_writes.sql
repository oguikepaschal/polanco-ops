-- The showcase views were only ever meant to be readable by anon
-- (20260623000000 / 20260709000000 / 20260823010000 all `grant select`), but
-- Supabase's default privileges on the public schema had already granted
-- anon and authenticated ALL on them. That is exploitable:
--
-- public_cars_view selects from a single table, so Postgres treats it as
-- automatically updatable, and it runs security_invoker = false — writes go
-- through to public.cars with the view owner's privileges, bypassing RLS.
-- Anyone holding the anon key (shipped in every public page's JS) could
-- UPDATE, DELETE or INSERT cars via PostgREST on /rest/v1/public_cars_view.
--
-- public_car_images_view is a join and so not auto-updatable, but its write
-- grants are revoked too: the app only ever SELECTs from either view
-- (lib/showcase/getPublicCars.ts), and nothing should rely on them staying
-- non-updatable by accident.
revoke insert, update, delete, truncate, references, trigger
  on public.public_cars_view, public.public_car_images_view
  from anon, authenticated;

-- Idempotent; re-stated so the intended grant is explicit.
grant select on public.public_cars_view to anon;
grant select on public.public_car_images_view to anon;
