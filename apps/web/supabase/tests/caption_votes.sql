-- Administrative connection only. Every synthetic user and row rolls back.
begin;
insert into auth.users(id,email) values
 ('77777777-7777-4777-8777-777777777777','caption-a@example.invalid'),
 ('88888888-8888-4888-8888-888888888888','caption-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated"}',true);
do $$
declare photo bigint; request_id uuid; caption uuid; changed integer;
begin
 select id into photo from public.food_photos order by sort_order limit 1;
 insert into public.caption_generation_requests(photo_id,prompt) values (photo,'Test prompt') returning id into request_id;
 insert into public.food_captions(photo_id,generation_id,dish,region,prompt,model)
   values (photo,request_id,'Meat and greens look savory.','This resembles Chinese cooking.','Test prompt','test-only') returning id into caption;
 perform set_config('test.caption_id',caption::text,true);
 if not exists (select 1 from public.latest_food_captions where id=caption) then raise exception 'Latest caption view missed generation'; end if;
 begin
   insert into public.caption_generation_requests(photo_id,prompt) values (photo,'Second prompt');
   raise exception 'Concurrent-generation cooldown bypassed';
 exception when sqlstate 'P0001' then
   if sqlerrm not like 'Please wait 30 seconds%' then raise; end if;
 end;
 begin
   insert into public.food_captions(photo_id,dish,region,prompt,model)
     values (photo,'Meat and greens look savory.','This resembles Chinese cooking.','Unrequested prompt','test-only');
   raise exception 'Unrequested generation accepted';
 exception when insufficient_privilege then null; end;
 begin
   insert into public.food_captions(photo_id,generation_id,dish,region,prompt,model)
     values (photo,request_id,'Meat and greens look savory.','This resembles Chinese cooking.','Forged prompt','test-only');
   raise exception 'Prompt mismatch accepted';
 exception when insufficient_privilege then null; end;
 begin
   insert into public.caption_votes(caption_id,value,user_id) values (caption,1,'88888888-8888-4888-8888-888888888888');
   raise exception 'Forged voter accepted';
 exception when insufficient_privilege then null; end;
 insert into public.caption_votes(caption_id,value) values (caption,1);
 begin
   insert into public.caption_votes(caption_id,value) values (caption,1);
   raise exception 'Duplicate vote accepted';
 exception when unique_violation then null; end;
 update public.caption_votes set value=-1 where caption_id=caption;
 if (select value from public.caption_votes where caption_id=caption) <> -1 then raise exception 'Vote change failed'; end if;
 begin
   update public.caption_votes set value=0 where caption_id=caption;
   raise exception 'Invalid rating accepted';
 exception when check_violation then null; end;
 begin
   update public.caption_votes set user_id='88888888-8888-4888-8888-888888888888' where caption_id=caption;
   raise exception 'Vote ownership reassignment accepted';
 exception when insufficient_privilege then null; end;
 begin
   update public.food_captions set dish='An overwritten caption.' where id=caption;
   raise exception 'Caption editing accepted';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims','{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}',true);
 if exists (select 1 from public.caption_votes where caption_id=caption) then raise exception 'Another user vote is visible'; end if;
 if exists (select 1 from public.caption_generation_requests where id=request_id) then raise exception 'Another user request is visible'; end if;
 update public.caption_votes set value=1 where caption_id=caption;
 get diagnostics changed=row_count;
 if changed <> 0 then raise exception 'Foreign vote modified'; end if;
 begin
   insert into public.food_captions(photo_id,generation_id,dish,region,prompt,model)
     values (photo,request_id,'Meat and greens look savory.','This resembles Chinese cooking.','Test prompt','test-only');
   raise exception 'Foreign generation request reused';
 exception when insufficient_privilege then null; end;
 insert into public.caption_votes(caption_id,value) values (caption,1);
 if (select count(*) from public.caption_votes where caption_id=caption) <> 1 then raise exception 'Vote isolation failed'; end if;
 begin
   delete from public.caption_generation_requests;
   raise exception 'Quota reset accepted';
 exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$
begin
 if not exists (select 1 from public.latest_food_captions where id=current_setting('test.caption_id')::uuid) then raise exception 'Public generation not visible'; end if;
 begin
   insert into public.caption_votes(caption_id,value) values (current_setting('test.caption_id')::uuid,1);
   raise exception 'Anonymous vote accepted';
 exception when insufficient_privilege then null; end;
 begin
   perform user_id from public.caption_votes;
   raise exception 'Anonymous vote identities visible';
 exception when insufficient_privilege then null; end;
 begin
   perform creator_id from public.food_captions;
   raise exception 'Public creator identities visible';
 exception when insufficient_privilege then null; end;
 begin
   insert into public.caption_generation_requests(photo_id,prompt) values (1,'Anonymous');
   raise exception 'Anonymous generation accepted';
 exception when insufficient_privilege then null; end;
 begin
   insert into public.food_captions(photo_id,dish,region,prompt,model)
     values (1,'Meat and greens look savory.','This resembles Chinese cooking.','Anon prompt','test-only');
   raise exception 'Anonymous caption accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Seed only synthetic older requests to exercise the rolling daily quota.
insert into public.caption_generation_requests(user_id,photo_id,prompt,created_at)
 select '88888888-8888-4888-8888-888888888888', (select id from public.food_photos order by sort_order limit 1),
   'Quota fixture', now() - interval '1 hour' - n * interval '1 minute' from generate_series(1,10) n;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}',true);
do $$
begin
 begin
  insert into public.caption_generation_requests(photo_id,prompt)
    select id,'Eleventh request' from public.food_photos order by sort_order limit 1;
  raise exception 'Daily generation limit bypassed';
 exception when sqlstate 'P0001' then
  if sqlerrm not like 'You have reached 10 generations%' then raise; end if;
 end;
end $$;
reset role;
do $$
begin
 if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r' and not c.relrowsecurity) then
   raise exception 'Application table lacks RLS';
 end if;
end $$;
rollback;
