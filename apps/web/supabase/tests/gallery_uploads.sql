-- Administrative connection; synthetic users, object metadata and photo rows roll back.
begin;
select set_config('test.gallery_baseline', (select count(*)::text from public.food_photos), true);
insert into auth.users (id,email) values
 ('33333333-3333-4333-8333-333333333333','gallery-upload-a@example.invalid'),
 ('44444444-4444-4444-8444-444444444444','gallery-upload-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
insert into storage.objects(bucket_id,name) values
 ('food-photos','33333333-3333-4333-8333-333333333333/55555555-5555-4555-8555-555555555555.jpg'),
 ('food-photos','33333333-3333-4333-8333-333333333333/66666666-6666-4666-8666-666666666666.jpg');
insert into public.food_photos(title,description,alt_text,storage_path) values
 ('Test plate one','Test only','A test plate','33333333-3333-4333-8333-333333333333/55555555-5555-4555-8555-555555555555.jpg'),
 ('Test plate two','Test only','A second test plate','33333333-3333-4333-8333-333333333333/66666666-6666-4666-8666-666666666666.jpg');
insert into storage.objects(bucket_id,name) values
 ('food-photos','33333333-3333-4333-8333-333333333333/99999999-9999-4999-8999-999999999999.jpg');
-- Emulate the Storage API's transaction-local deletion setting for synthetic metadata only.
select set_config('storage.allow_delete_query','true',true);
do $$
declare changed integer;
begin
 if (select count(*) from public.food_photos where owner_id = auth.uid()) <> 2 then raise exception 'Owner defaults or inserts failed'; end if;
 if (select count(distinct sort_order) from public.food_photos where owner_id = auth.uid()) <> 2 then raise exception 'Sequence did not assign distinct orders'; end if;
 delete from storage.objects where bucket_id='food-photos' and name='33333333-3333-4333-8333-333333333333/55555555-5555-4555-8555-555555555555.jpg';
 get diagnostics changed = row_count;
 if changed <> 0 then raise exception 'Published photo object deletion accepted'; end if;
 delete from storage.objects where bucket_id='food-photos' and name='33333333-3333-4333-8333-333333333333/99999999-9999-4999-8999-999999999999.jpg';
 get diagnostics changed = row_count;
 if changed <> 1 then raise exception 'Failed-upload cleanup denied'; end if;
 begin
  insert into storage.objects(bucket_id,name) values ('food-photos','44444444-4444-4444-8444-444444444444/77777777-7777-4777-8777-777777777777.jpg');
  raise exception 'Foreign directory upload accepted';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.food_photos(title,alt_text,storage_path,owner_id) values ('Spoof','Spoof','missing.jpg','44444444-4444-4444-8444-444444444444');
  raise exception 'Spoofed owner accepted';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.food_photos(title,alt_text,storage_path,sort_order) values ('Spoof','Spoof','missing.jpg',1);
  raise exception 'Client display order accepted';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.food_photos(title,alt_text,storage_path) values ('Missing','Missing','33333333-3333-4333-8333-333333333333/77777777-7777-4777-8777-777777777777.jpg');
  raise exception 'Nonexistent object reference accepted';
 exception when insufficient_privilege then null; end;
 begin
  update public.food_photos set title='Overwrite';
  raise exception 'Public photo edits accepted';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}',true);
do $$
begin
 if exists(select 1 from storage.objects where bucket_id='food-photos' and name like '33333333-3333-4333-8333-333333333333/%') then raise exception 'Foreign object metadata visible'; end if;
 begin
  insert into public.food_photos(title,alt_text,storage_path) values ('Foreign','Foreign','33333333-3333-4333-8333-333333333333/55555555-5555-4555-8555-555555555555.jpg');
  raise exception 'Foreign object reference accepted';
 exception when insufficient_privilege or check_violation then null; end;
end $$;
set local role anon;
do $$
begin
 if (select count(*) from public.food_photos) <> current_setting('test.gallery_baseline')::integer + 2 then raise exception 'New photos not publicly readable'; end if;
 begin
  insert into public.food_photos(title,alt_text,storage_path) values ('Anon','Anon','anon.jpg');
  raise exception 'Anonymous publishing accepted';
 exception when insufficient_privilege then null; end;
 begin
  insert into storage.objects(bucket_id,name) values ('food-photos','33333333-3333-4333-8333-333333333333/88888888-8888-4888-8888-888888888888.jpg');
  raise exception 'Anonymous Storage upload accepted';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
