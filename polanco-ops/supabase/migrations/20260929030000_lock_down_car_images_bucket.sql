-- car-images storage bucket, based on a dump of production's storage policies
-- and bucket config (29 Sep 2026). The bucket is public: car photos are served
-- from /storage/v1/object/public/..., which does not go through RLS, so none
-- of the policies below are needed to display images on the site.
--
-- 1. Two SELECT policies granted the `public` role read on every object in the
--    bucket. That let anyone holding the anon key LIST the bucket through the
--    Storage API — every file, including photos of hidden, sold and deleted
--    cars that public_car_images_view deliberately filters out. The app never
--    lists the bucket. Dropped.
drop policy if exists "car-images-select 1u5lh1t_0" on storage.objects;
drop policy if exists "car_images_storage_select" on storage.objects;

-- 2. The dashboard-template policies duplicate the hand-written ones below
--    (same bucket, auth.role() = 'authenticated' instead of TO authenticated).
--    Dropped so each operation has exactly one policy.
drop policy if exists "car-images-insert 1u5lh1t_0" on storage.objects;
drop policy if exists "car-images-delete 1u5lh1t_0" on storage.objects;
drop policy if exists "car-images-delete 1u5lh1t_1" on storage.objects;

-- 3. End state: three policies, all TO authenticated. car_images_storage_insert
--    and car_images_storage_delete already exist in production; SELECT is
--    re-added for signed-in staff only (Storage reads the row back on upload
--    and delete).
drop policy if exists "car_images_storage_select_authenticated" on storage.objects;
create policy "car_images_storage_select_authenticated" on storage.objects
  for select to authenticated using (bucket_id = 'car-images');

-- 4. Server-side file restrictions. Until now only the file input's `accept`
--    attribute limited uploads, which any direct API call ignores. 10 MB leaves
--    room for the uncompressed original that lib/supabase/storage.ts falls
--    back to when browser-side compression fails.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'],
    file_size_limit = 10485760
where id = 'car-images';
