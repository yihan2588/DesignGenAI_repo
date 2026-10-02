-- Preserve the existing public gallery; members can add new photos, not edit seeds.
lock table public.food_photos in access exclusive mode;
alter table public.food_photos add column owner_id uuid default auth.uid()
  references auth.users(id) on delete set null;
create index food_photos_owner_id_idx on public.food_photos(owner_id);

create sequence public.food_photo_sort_order_seq as integer;
select setval('public.food_photo_sort_order_seq', greatest(coalesce(max(sort_order), 0), 1), coalesce(max(sort_order), 0) > 0)
  from public.food_photos;
alter sequence public.food_photo_sort_order_seq owned by public.food_photos.sort_order;
alter table public.food_photos alter column sort_order set default nextval('public.food_photo_sort_order_seq');
grant usage on sequence public.food_photo_sort_order_seq to authenticated;
grant insert (title, description, alt_text, storage_path) on public.food_photos to authenticated;

alter table public.food_photos
  add constraint food_photo_title_length check (char_length(btrim(title)) between 1 and 120),
  add constraint food_photo_description_length check (char_length(description) <= 1000),
  add constraint food_photo_alt_length check (char_length(btrim(alt_text)) between 1 and 300),
  add constraint food_photo_owner_path check (owner_id is null or storage_path ~ ('^' || owner_id::text || '/[0-9a-f-]{36}\.jpg$'));

create policy "Members publish own food photos" on public.food_photos for insert to authenticated
  with check (owner_id = (select auth.uid()) and exists (
    select 1 from storage.objects o where o.bucket_id = 'food-photos' and o.name = storage_path
  ));

-- The bucket is already public and restricted to JPEG/2 MiB. New object names are immutable.
create policy "Upload own food photo" on storage.objects for insert to authenticated
  with check (bucket_id = 'food-photos' and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.jpg$'));
create policy "Read own food photo objects" on storage.objects for select to authenticated
  using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Compensate failed metadata saves without allowing published gallery images to disappear.
create policy "Clean up unpublished own food photos" on storage.objects for delete to authenticated
  using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (select 1 from public.food_photos p where p.storage_path = name));
