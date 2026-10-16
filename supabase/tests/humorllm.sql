-- Run with an administrative connection. All fixtures and configuration roll back.
begin;
insert into auth.users(id,email) values
 ('77777777-7777-4777-8777-777777777777','humor-a@example.invalid'),
 ('88888888-8888-4888-8888-888888888888','humor-b@example.invalid');
update public.profiles set first_name='Test',last_name='Voter' where id in ('77777777-7777-4777-8777-777777777777','88888888-8888-4888-8888-888888888888');
update private.humor_config set writer_key_sha256=encode(extensions.digest('sql-fixture-only','sha256'),'hex');
insert into public.humor_images(id,owner_id,title,alt_text,storage_path) values
 ('11111111-1111-4111-8111-111111111111','77777777-7777-4777-8777-777777777777','Test','Test image','77777777-7777-4777-8777-777777777777/11111111-1111-4111-8111-111111111111.jpg');
insert into public.humor_runs(id,image_id,owner_id,status,caption_a,caption_b,request_key) values
 ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','77777777-7777-4777-8777-777777777777','ready','First caption.','Second caption.',gen_random_uuid()),
 ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','77777777-7777-4777-8777-777777777777','pending',null,null,gen_random_uuid()),
 ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','77777777-7777-4777-8777-777777777777','ready','Third caption.','Fourth caption.',gen_random_uuid());
insert into private.humor_run_details(run_id) values('33333333-3333-4333-8333-333333333333');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated"}',true);
do $$ declare p jsonb; token uuid; begin
 begin perform public.humor_poll('22222222-2222-4222-8222-222222222222');raise exception 'Poll unlocked before voting';exception when insufficient_privilege then null;end;
 begin perform public.humor_claim('33333333-3333-4333-8333-333333333333','wrong');raise exception 'Writer key bypassed';exception when insufficient_privilege then null;end;
 token:=public.humor_claim('33333333-3333-4333-8333-333333333333','sql-fixture-only');
 if token is null then raise exception 'Claim failed';end if;
 if public.humor_claim('33333333-3333-4333-8333-333333333333','sql-fixture-only') is not null then raise exception 'Duplicate claim allowed';end if;
 perform public.humor_record_step('33333333-3333-4333-8333-333333333333',token,'sql-fixture-only','{"stage":"test"}');
 perform public.humor_finish('33333333-3333-4333-8333-333333333333',token,'sql-fixture-only','{"baseline":"New first caption.","guided":"New second caption."}');
 if not exists(select 1 from public.humor_runs where id='33333333-3333-4333-8333-333333333333' and status='ready' and caption_a is not null and caption_b is not null) then raise exception 'Atomic finalization failed';end if;
 p:=public.humor_vote('22222222-2222-4222-8222-222222222222','A');
 if p->>'choice'<>'A' or (p->>'total')::int<>1 then raise exception 'Initial vote failed';end if;
 p:=public.humor_vote('22222222-2222-4222-8222-222222222222','B');
 if p->>'choice'<>'A' or (p->>'total')::int<>1 then raise exception 'Vote was changed or duplicated';end if;
 begin perform public.humor_poll('44444444-4444-4444-8444-444444444444');raise exception 'One vote unlocked another run';exception when insufficient_privilege then null;end;
 begin update public.humor_votes set choice='B';raise exception 'Raw vote modification allowed';exception when insufficient_privilege then null;end;
 begin perform * from private.humor_run_details;raise exception 'Private trace exposed';exception when insufficient_privilege then null;end;
 begin perform public.humor_vote('22222222-2222-4222-8222-222222222222','X');raise exception 'Invalid choice accepted';exception when raise_exception then if sqlerrm<>'Choose A or B.' then raise;end if;end;
 perform set_config('request.jwt.claims','{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}',true);
 if exists(select 1 from public.humor_votes where run_id='22222222-2222-4222-8222-222222222222') then raise exception 'Foreign vote visible';end if;
 begin perform public.humor_poll('22222222-2222-4222-8222-222222222222');raise exception 'Other voter unlocked this account';exception when insufficient_privilege then null;end;
 p:=public.humor_vote('22222222-2222-4222-8222-222222222222','B');
 if (p->>'a')::int<>1 or (p->>'b')::int<>1 or (p->>'total')::int<>2 then raise exception 'Aggregate counts incorrect';end if;
 if (select count(*) from public.humor_votes where run_id='22222222-2222-4222-8222-222222222222')<>1 then raise exception 'Own-row isolation failed';end if;
end $$;
reset role;
do $$ begin
 begin update public.humor_runs set caption_a='Changed after voting.' where id='22222222-2222-4222-8222-222222222222';raise exception 'Ready pair was changed';exception when raise_exception then if sqlerrm<>'Published caption pairs are immutable.' then raise;end if;end;
end $$;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
 if not exists(select 1 from public.humor_runs where id='22222222-2222-4222-8222-222222222222') then raise exception 'Public pair unavailable';end if;
 begin perform public.humor_poll('22222222-2222-4222-8222-222222222222');raise exception 'Anonymous poll exposed';exception when insufficient_privilege then null;end;
 begin perform public.humor_vote('22222222-2222-4222-8222-222222222222','A');raise exception 'Anonymous vote allowed';exception when insufficient_privilege then null;end;
 begin perform * from public.humor_votes;raise exception 'Anonymous votes exposed';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Administrator-seeded examples must not consume a member's ten-run allowance.
insert into public.humor_runs(image_id,owner_id,status,caption_a,caption_b,is_example,request_key,created_at)
select '11111111-1111-4111-8111-111111111111','77777777-7777-4777-8777-777777777777','ready','Seed first.','Seed second.',true,gen_random_uuid(),now()-interval '2 minutes' from generate_series(1,12);
insert into public.humor_runs(id,image_id,owner_id,status,request_key) values ('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','77777777-7777-4777-8777-777777777777','failed',gen_random_uuid());
update public.humor_runs set created_at=now()-interval '2 minutes' where owner_id='77777777-7777-4777-8777-777777777777';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated"}',true);
do $$ begin
 if public.humor_retry('55555555-5555-4555-8555-555555555555',gen_random_uuid()) is null then raise exception 'Examples consumed member quota';end if;
 begin update public.humor_runs set is_example=true;raise exception 'Member could bypass quota with example flag';exception when insufficient_privilege then null;end;
end $$;
reset role;
insert into public.humor_runs(image_id,owner_id,status,request_key,created_at)
select '11111111-1111-4111-8111-111111111111','77777777-7777-4777-8777-777777777777','failed',gen_random_uuid(),now()-interval '2 minutes' from generate_series(1,6);
update public.humor_runs set created_at=now()-interval '2 minutes' where owner_id='77777777-7777-4777-8777-777777777777';
set local role authenticated;
do $$ begin
 begin perform public.humor_retry('55555555-5555-4555-8555-555555555555',gen_random_uuid());raise exception 'Daily member quota bypassed';exception when raise_exception then if sqlerrm<>'You have reached 10 comparisons today. Come back tomorrow.' then raise;end if;end;
end $$;
reset role;
select 'HumorLLM access, voting, claim and finalization checks passed' as result;
rollback;
