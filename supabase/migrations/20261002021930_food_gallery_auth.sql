-- Extend the existing Homework 2 database; image bytes remain in Storage.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text check (first_name is null or (char_length(btrim(first_name)) between 1 and 80)),
  last_name text check (last_name is null or (char_length(btrim(last_name)) between 1 and 80)),
  avatar_path text check (avatar_path is null or
    avatar_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update (first_name, last_name, avatar_path) on public.profiles to authenticated;

create policy "Read own profile" on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "Update own profile" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Only auth's INSERT trigger invokes this privileged function.
-- Never trust a user-supplied ID or metadata for authorization.
create function private.create_food_gallery_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;
revoke all on function private.create_food_gallery_profile() from public, anon, authenticated;
create trigger food_gallery_profile_created after insert on auth.users
  for each row execute function private.create_food_gallery_profile();

-- Backfill existing accounts without overwriting anyone's profile.
insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;

create function private.touch_food_gallery_profile()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;
revoke all on function private.touch_food_gallery_profile() from public, anon, authenticated;
create trigger food_gallery_profile_updated before update on public.profiles
  for each row execute function private.touch_food_gallery_profile();

-- Signed-in visitors can still read the public Homework 2 gallery.
grant select on public.food_photos to authenticated;
create policy "Signed-in gallery read" on public.food_photos for select to authenticated using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg','image/png','image/webp']);

-- New versioned objects avoid overwrites. No UPDATE/upsert permission is needed.
create policy "Upload own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Read own avatar" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Delete own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
