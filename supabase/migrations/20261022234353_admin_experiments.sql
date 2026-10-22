-- Additive admin domain. No changes to existing captions or votes.
alter table public.profiles add column is_superadmin boolean not null default false;
-- Existing column-scoped UPDATE grants deliberately exclude is_superadmin.
create function private.require_superadmin() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or auth.jwt()->>'app_metadata' is null
 or auth.jwt()->'app_metadata'->>'provider' is distinct from 'google'
 or not exists(select 1 from public.profiles where id=auth.uid() and is_superadmin) then
 raise exception 'Google superadmin access required.' using errcode='42501'; end if;
end $$;
revoke all on function private.require_superadmin() from public,anon,authenticated;
create function public.admin_access() returns boolean language plpgsql security definer set search_path='' as $$
begin perform private.require_superadmin(); return true; end $$;
revoke all on function public.admin_access() from public,anon;
grant execute on function public.admin_access() to authenticated;
create table private.prompt_revisions (
 id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 80),
 prompt text not null check(length(btrim(prompt)) between 1 and 12000), system_prompt text not null default '' check(length(system_prompt)<=12000),
 model text not null check(model in ('gemini-3.1-flash-lite','gemini-3.8-flash','gemini-2.5-flash','gemini-2.5-pro')),
 temperature numeric not null check(temperature between 0 and 2), engine text not null check(engine in ('direct','planned')),
 parent_id uuid references private.prompt_revisions(id), archived boolean not null default false, created_at timestamptz not null default now()
);
create table private.active_experiment (
 singleton boolean primary key default true check(singleton), first_id uuid not null references private.prompt_revisions(id), second_id uuid not null references private.prompt_revisions(id), check(first_id<>second_id), updated_at timestamptz not null default now()
);
create table private.experiment_run_configs (
 run_id uuid primary key references public.humor_runs(id) on delete cascade,
 first_id uuid not null references private.prompt_revisions(id), second_id uuid not null references private.prompt_revisions(id)
);
create table private.admin_audit (id bigint generated always as identity primary key, actor uuid not null, action text not null, target text, created_at timestamptz not null default now());
alter table private.prompt_revisions enable row level security;
alter table private.active_experiment enable row level security;
alter table private.experiment_run_configs enable row level security;
alter table private.admin_audit enable row level security;
revoke all on private.prompt_revisions,private.active_experiment,private.experiment_run_configs,private.admin_audit from public,anon,authenticated;
insert into private.prompt_revisions(name,prompt,model,temperature,engine) values
 ('MVP direct','Write one funny, relevant caption for this image. Return JSON with a single caption string.','gemini-3.1-flash-lite',1,'direct'),
 ('MVP visual plan','Use the visual plan to write three distinct, grounded, surprising captions; select the strongest.','gemini-3.1-flash-lite',1,'planned');
insert into private.active_experiment(first_id,second_id) select a.id,b.id from private.prompt_revisions a,private.prompt_revisions b where a.name='MVP direct' and b.name='MVP visual plan';
-- Historical revisions stay separate from the configurable generator's new revisions.
insert into private.prompt_revisions(name,prompt,model,temperature,engine,archived) values
 ('MVP direct · legacy','Historical humor-mvp-3 BASELINE_PROMPT; immutable source at commit 13edf43 lib/humor/prompts.ts','gemini-3.1-flash-lite',1,'direct',true),
 ('MVP visual plan · legacy','Historical humor-mvp-3 PLAN_PROMPT and candidatePrompt; immutable source at commit 13edf43 lib/humor/prompts.ts','gemini-3.1-flash-lite',1,'planned',true);
-- Only identify historical pairs with recorded matching MVP provenance.
insert into private.experiment_run_configs select d.run_id,f.id,s.id from private.humor_run_details d cross join private.prompt_revisions f cross join private.prompt_revisions s where f.name='MVP direct · legacy' and s.name='MVP visual plan · legacy' and d.result->>'prompt_version'='humor-mvp-3' and d.result->>'model'='gemini-3.1-flash-lite' and d.baseline_slot in ('A','B');
create function public.humor_experiment_claim(p_run uuid,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare token uuid; a private.active_experiment; result jsonb;
begin
 token:=private.humor_claim(p_run,p_key);
 if token is null then return null; end if;
 select * into a from private.active_experiment where singleton for share;
 insert into private.experiment_run_configs values(p_run,a.first_id,a.second_id);
 select jsonb_build_object('token',token,'first',to_jsonb(f),'second',to_jsonb(s)) into result from private.prompt_revisions f,private.prompt_revisions s where f.id=a.first_id and s.id=a.second_id;
 return result;
end $$;
revoke all on function public.humor_experiment_claim(uuid,text) from public,anon;
grant execute on function public.humor_experiment_claim(uuid,text) to authenticated;
create function public.admin_mutate(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; a uuid; b uuid; path text;
begin
 perform private.require_superadmin();
 if p_action='save_prompt' then
  insert into private.prompt_revisions(name,prompt,system_prompt,model,temperature,engine,parent_id)
  values(p_data->>'name',p_data->>'prompt',coalesce(p_data->>'system_prompt',''),p_data->>'model',(p_data->>'temperature')::numeric,p_data->>'engine',(nullif(p_data->>'parent_id',''))::uuid) returning id into v_id;
 elsif p_action='activate' then
  a:=(p_data->>'first_id')::uuid; b:=(p_data->>'second_id')::uuid;
  -- Serialize activation with archive; no active revision can disappear between checks.
  perform 1 from private.active_experiment where singleton for update;
  if a=b or (select count(*) from private.prompt_revisions where id in(a,b) and not archived)<>2 then raise exception 'Choose two different available configurations.'; end if;
  update private.active_experiment set first_id=a,second_id=b,updated_at=now();
 elsif p_action='delete_prompt' then
  v_id:=(p_data->>'id')::uuid;
  perform 1 from private.active_experiment where singleton for update;
  if exists(select 1 from private.active_experiment where first_id=v_id or second_id=v_id) then raise exception 'Replace this active configuration before deleting it.'; end if;
  update private.prompt_revisions set archived=true where id=v_id;
  if not found then raise exception 'Configuration not found.'; end if;
 elsif p_action='update_media' then
  v_id:=(p_data->>'id')::uuid;
  update public.humor_images set title=p_data->>'title',alt_text=p_data->>'alt_text' where id=v_id;
  if not found then raise exception 'Image not found.'; end if;
 elsif p_action='delete_media' then
  v_id:=(p_data->>'id')::uuid;
  if p_data->>'confirmation' is distinct from 'DELETE' then raise exception 'Type DELETE to confirm.'; end if;
  delete from public.humor_images where id=v_id returning storage_path into path;
  if not found then raise exception 'Image not found.'; end if;
  -- DB cascade removes the entry, its caption pairs and votes. Object cleanup follows through Storage API.
 else raise exception 'Unknown admin action.'; end if;
 insert into private.admin_audit(actor,action,target) values(auth.uid(),p_action,coalesce(v_id::text,p_data->>'first_id'));
 return jsonb_build_object('id',v_id,'storage_path',path);
end $$;
revoke all on function public.admin_mutate(text,jsonb) from public,anon;
grant execute on function public.admin_mutate(text,jsonb) to authenticated;
create policy "Admin cleanup unreferenced objects" on storage.objects for delete to authenticated using(bucket_id='humor-images' and not exists(select 1 from public.humor_images where storage_path=name) and exists(select 1 from public.profiles where id=(select auth.uid()) and is_superadmin));
create function public.admin_snapshot(p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.require_superadmin();
 if p_page<1 or p_page>100000 then raise exception 'Invalid page.'; end if;
 select jsonb_build_object(
 'metrics',jsonb_build_object('profiles',(select count(*) from public.profiles),'images',(select count(*) from public.humor_images),'ready',(select count(*) from public.humor_runs where status='ready'),'failed',(select count(*) from public.humor_runs where status='failed'),'votes',(select count(*) from public.humor_votes),'voters',(select count(distinct user_id) from public.humor_votes),'unmapped_votes',(select count(*) from public.humor_votes v where not exists(select 1 from private.experiment_run_configs c where c.run_id=v.run_id))),
 'active',(select to_jsonb(a) from private.active_experiment a),
 'prompts',(select coalesce(jsonb_agg(to_jsonb(p) order by created_at desc),'[]') from private.prompt_revisions p),
 'profiles',(select coalesce(jsonb_agg(t),'[]') from (select p.*,u.email from public.profiles p join auth.users u on u.id=p.id order by p.created_at desc limit 50 offset (p_page-1)*50) t),
 'media',(select coalesce(jsonb_agg(t),'[]') from (select i.*,(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,'caption_a',r.caption_a,'caption_b',r.caption_b,'created_at',r.created_at) order by r.created_at desc),'[]') from public.humor_runs r where r.image_id=i.id) runs from public.humor_images i order by i.created_at desc limit 50 offset (p_page-1)*50) t),
 'votes',(select coalesce(jsonb_agg(t),'[]') from (select v.*,i.title from public.humor_votes v join public.humor_runs r on r.id=v.run_id join public.humor_images i on i.id=r.image_id order by v.created_at desc limit 50 offset (p_page-1)*50) t),
 'matchups',(select coalesce(jsonb_agg(t),'[]') from (select c.first_id,c.second_id,count(*) n,count(*) filter(where v.choice=d.baseline_slot) first_wins,count(distinct v.user_id) voters from public.humor_votes v join private.experiment_run_configs c on c.run_id=v.run_id join private.humor_run_details d on d.run_id=v.run_id where d.baseline_slot in ('A','B') group by c.first_id,c.second_id) t),
 'daily',(select coalesce(jsonb_agg(t),'[]') from (select date_trunc('day',created_at at time zone 'UTC')::date as "day",count(*) votes from public.humor_votes where created_at>now()-interval '14 days' group by 1 order by 1) t)
 ) into result;
 return result;
end $$;
revoke all on function public.admin_snapshot(integer) from public,anon;
grant execute on function public.admin_snapshot(integer) to authenticated;
create or replace function private.humor_poll(p_run uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_choice text; v_a integer; v_b integer; slot text; labels jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to vote.' using errcode='42501'; end if;
 select choice into v_choice from public.humor_votes where run_id=p_run and user_id=auth.uid();
 if not found then raise exception 'Choose a caption to reveal the poll.' using errcode='42501'; end if;
 select baseline_slot into slot from private.humor_run_details where run_id=p_run;
 select jsonb_build_object('A',case when slot='A' then f.name else s.name end,'B',case when slot='B' then f.name else s.name end) into labels from private.experiment_run_configs c join private.prompt_revisions f on f.id=c.first_id join private.prompt_revisions s on s.id=c.second_id where c.run_id=p_run;
 select count(*) filter(where choice='A'),count(*) filter(where choice='B') into v_a,v_b from public.humor_votes where run_id=p_run;
 return jsonb_build_object('choice',v_choice,'a',v_a,'b',v_b,'total',v_a+v_b,'baseline_slot',slot,'labels',labels);
end $$;
