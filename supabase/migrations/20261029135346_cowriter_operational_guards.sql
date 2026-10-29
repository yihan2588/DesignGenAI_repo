-- The unused empty catalog bucket is retained; bucket deletion must use the Storage API.
-- Static, content-addressed teaching assets are deployed with the app. There is no runtime catalog upload endpoint.
drop function public.cowriter_import(text,jsonb);
drop function private.cowriter_import(text,jsonb);
drop policy cowriter_catalog_insert on storage.objects;
drop policy cowriter_catalog_update on storage.objects;
drop policy cowriter_catalog_admin_read on storage.objects;
create function private.cowriter_upload_allowed() returns boolean language sql security definer set search_path='' as $$
 select auth.uid() is not null and (select count(*) from storage.objects where bucket_id='cowriter-uploads' and name like auth.uid()::text||'/%')<100
$$;
revoke all on function private.cowriter_upload_allowed() from public,anon;
grant execute on function private.cowriter_upload_allowed() to authenticated;
drop policy cowriter_upload_insert on storage.objects;
create policy cowriter_upload_insert on storage.objects for insert to authenticated with check(bucket_id='cowriter-uploads' and (storage.foldername(name))[1]=(select auth.uid())::text and private.cowriter_upload_allowed());
