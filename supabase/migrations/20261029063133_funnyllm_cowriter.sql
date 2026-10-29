-- Additive co-writer schema; legacy comparisons and prompt configurations are untouched.
create table public.cowriter_catalog (
 id uuid primary key, source_url text not null, source_hash text not null,
 description text not null, description_origin text not null check(description_origin in ('teaching','context','backfill','missing')),
 affordances text not null default '', family text not null, storage_path text,
 width integer, height integer, available boolean not null default false,
 embedding extensions.vector(768), index_version text not null,
 search_text tsvector generated always as (to_tsvector('english',description||' '||affordances)) stored,
 updated_at timestamptz not null default now()
);
create index cowriter_catalog_fts on public.cowriter_catalog using gin(search_text);
alter table public.cowriter_catalog enable row level security;
grant select(id,description,affordances,family,storage_path,width,height,available,index_version) on public.cowriter_catalog to authenticated;
create policy cowriter_catalog_read on public.cowriter_catalog for select to authenticated using(available);
create table private.cowriter_settings(singleton boolean primary key default true check(singleton),enabled boolean not null default true);
insert into private.cowriter_settings values(true,true);
create table private.cowriter_sessions (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 state jsonb not null, revision integer not null default 0, created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index cowriter_sessions_owner on private.cowriter_sessions(owner_id,updated_at desc);
create table private.cowriter_requests (
 id uuid not null, owner_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null references private.cowriter_sessions(id) on delete cascade, action text not null,
 fingerprint text not null, base_revision integer not null, token uuid not null default gen_random_uuid(),
 status text not null default 'running' check(status in('running','ready','failed')),
 result jsonb, metrics jsonb not null default '{}', error text,
 created_at timestamptz not null default now(), finished_at timestamptz, primary key(owner_id,id)
);
create index cowriter_requests_created on private.cowriter_requests(created_at desc);
create index cowriter_requests_session on private.cowriter_requests(session_id,base_revision desc);
create table private.cowriter_revisions (
 session_id uuid not null references private.cowriter_sessions(id) on delete cascade,
 revision integer not null,state jsonb not null,created_at timestamptz not null default now(),primary key(session_id,revision)
);
create table private.cowriter_feedback (
 owner_id uuid not null references auth.users(id) on delete cascade,session_id uuid not null references private.cowriter_sessions(id) on delete cascade,
 revision integer not null,option_id uuid not null,reason text not null check(reason in('keep','export','too_literal','wordy','familiar','no_connection')),
 created_at timestamptz not null default now(), primary key(owner_id,session_id,revision,option_id,reason)
);
alter table private.cowriter_settings enable row level security;
alter table private.cowriter_sessions enable row level security;
alter table private.cowriter_requests enable row level security;
alter table private.cowriter_revisions enable row level security;
alter table private.cowriter_feedback enable row level security;
-- All private mutations pass verified auth.uid + the existing server-only writer key.
create function private.cowriter_begin(p_key text,p_request uuid,p_action text,p_fingerprint text,p_session uuid,p_revision integer,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); r private.cowriter_requests; s private.cowriter_sessions; t uuid;
begin
 perform private.check_humor_writer(p_key);
 if p_action not in('draft','shorter','less_obvious','less_mean','new_angle','swap','manual','undo') or length(p_fingerprint)<>64 then raise exception 'Invalid request.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,43));
 select * into r from private.cowriter_requests where owner_id=u and id=p_request;
 if found then
  if r.fingerprint<>p_fingerprint then raise exception 'Request key was reused with different content.' using errcode='22023'; end if;
  if r.status='ready' then return jsonb_build_object('cached',true,'state',r.result); end if;
  if r.status='failed' then raise exception 'This attempt ended. Please start a new attempt.'; end if;
  raise exception 'This request is already running.' using errcode='55P03';
 end if;
 if p_action not in('manual','undo') then
  if not (select enabled from private.cowriter_settings where singleton) then raise exception 'The writer is temporarily paused.' using errcode='57014'; end if;
  if (select count(*) from private.cowriter_requests where owner_id=u and action not in('manual','undo') and created_at>now()-interval '24 hours')>=50
   or (select count(*) from private.cowriter_requests where action not in('manual','undo') and created_at>now()-interval '24 hours')>=500 then raise exception 'The daily writing allowance has been reached.' using errcode='54000'; end if;
  if exists(select 1 from private.cowriter_requests where owner_id=u and status='running' and created_at>now()-interval '25 seconds') then raise exception 'A request is still running. Please wait a moment.' using errcode='55P03'; end if;
 end if;
 if p_action='draft' then
  if p_input->>'mode' not in('pic','thought') or length(p_input->>'text')>700 or length(p_input->>'locks')>240 then raise exception 'Invalid draft input.'; end if;
  if p_input->>'mode'='pic' and (split_part(p_input->>'uploadPath','/',1)<>u::text or not exists(select 1 from storage.objects where bucket_id='cowriter-uploads' and name=p_input->>'uploadPath')) then raise exception 'Image not found.' using errcode='42501'; end if;
  if p_input->>'mode'='thought' and length(trim(p_input->>'text'))<3 then raise exception 'Add a thought.'; end if;
  insert into private.cowriter_sessions(owner_id,state) values(u,jsonb_build_object('input',p_input,'options','[]'::jsonb,'pool','[]'::jsonb)) returning * into s;
 else
  select * into s from private.cowriter_sessions where id=p_session and owner_id=u for update;
  if not found then raise exception 'Draft not found.' using errcode='42501'; end if;
  if s.revision<>p_revision then raise exception 'This draft changed. Reload before editing.' using errcode='40001'; end if;
 end if;
 insert into private.cowriter_requests(id,owner_id,session_id,action,fingerprint,base_revision) values(p_request,u,s.id,p_action,p_fingerprint,s.revision) returning token into t;
 return jsonb_build_object('token',t,'sessionId',s.id,'state',s.state||jsonb_build_object('id',s.id,'revision',s.revision));
end $$;
create function public.cowriter_begin(p_key text,p_request uuid,p_action text,p_fingerprint text,p_session uuid,p_revision integer,p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.cowriter_begin(p_key,p_request,p_action,p_fingerprint,p_session,p_revision,p_input)$$;

create function private.cowriter_finish(p_key text,p_request uuid,p_token uuid,p_state jsonb,p_metrics jsonb,p_error text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.cowriter_requests; s private.cowriter_sessions; v jsonb;
begin
 perform private.check_humor_writer(p_key);
 select * into r from private.cowriter_requests where id=p_request and owner_id=auth.uid() and token=p_token for update;
 if not found then raise exception 'Request not found.' using errcode='42501'; end if;
 if r.status='ready' then return r.result; end if;
 if r.status<>'running' then raise exception 'Request already ended.'; end if;
 select * into s from private.cowriter_sessions where id=r.session_id and owner_id=auth.uid() for update;
 if p_error is not null or s.revision<>r.base_revision then
  update private.cowriter_requests set status='failed',error=left(coalesce(p_error,'Draft changed.'),240),metrics=p_metrics,finished_at=now() where owner_id=auth.uid() and id=p_request;
  return null;
 end if;
 if p_state is null or jsonb_typeof(p_state->'options')<>'array' or jsonb_array_length(p_state->'options') not between 1 and 3 or pg_column_size(p_state)>80000 then raise exception 'Invalid completed draft.'; end if;
 v=p_state||jsonb_build_object('id',s.id,'revision',s.revision+1);
 if s.revision>0 then insert into private.cowriter_revisions values(s.id,s.revision,s.state,now()) on conflict do nothing; end if;
 update private.cowriter_sessions set state=v,revision=revision+1,updated_at=now() where id=s.id;
 update private.cowriter_requests set status='ready',result=v,metrics=p_metrics,finished_at=now() where owner_id=auth.uid() and id=p_request;
 return v;
end $$;
create function public.cowriter_finish(p_key text,p_request uuid,p_token uuid,p_state jsonb,p_metrics jsonb,p_error text default null) returns jsonb language sql security invoker set search_path='' as $$select private.cowriter_finish(p_key,p_request,p_token,p_state,p_metrics,p_error)$$;
create function private.cowriter_read(p_session uuid default null,p_revision integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.cowriter_sessions; v jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
 if p_session is null then return (select coalesce(jsonb_agg(t),'[]') from (select id,revision,state->'input' as input,updated_at from private.cowriter_sessions where owner_id=auth.uid() and revision>0 order by updated_at desc limit 30)t); end if;
 select * into s from private.cowriter_sessions where id=p_session and owner_id=auth.uid();
 if not found then raise exception 'Draft not found.' using errcode='42501'; end if;
 if p_revision is null then return s.state||jsonb_build_object('id',s.id,'revision',s.revision); end if;
 select state into v from private.cowriter_revisions where session_id=p_session and revision=p_revision;
 return v;
end $$;
create function public.cowriter_read(p_session uuid default null,p_revision integer default null) returns jsonb language sql security invoker set search_path='' as $$select private.cowriter_read(p_session,p_revision)$$;
create function private.cowriter_feedback(p_session uuid,p_revision integer,p_option uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from private.cowriter_sessions s where s.id=p_session and s.owner_id=auth.uid() and s.revision=p_revision and exists(select 1 from jsonb_array_elements(s.state->'options') o where o->>'id'=p_option::text)) then raise exception 'Draft changed or unavailable.' using errcode='42501'; end if;
 insert into private.cowriter_feedback values(auth.uid(),p_session,p_revision,p_option,p_reason,now()) on conflict do nothing;
end $$;
create function public.cowriter_feedback(p_session uuid,p_revision integer,p_option uuid,p_reason text) returns void language sql security invoker set search_path='' as $$select private.cowriter_feedback(p_session,p_revision,p_option,p_reason)$$;

-- Small catalog: exact cosine search avoids ANN tuning and missed neighbors.
create function private.cowriter_search(p_vectors jsonb,p_queries text[],p_version text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
 if jsonb_array_length(p_vectors)<>3 or cardinality(p_queries)<>3 then raise exception 'Three query channels required.'; end if;
 with channels as(select n,(p_vectors->(n-1))::text::extensions.vector(768) v,p_queries[n] q from generate_series(1,3) n),
 dense as(select c.n,x.id, row_number() over(partition by c.n order by x.distance,x.id) r from channels c cross join lateral(select i.id, i.embedding operator(extensions.<=>) c.v distance from public.cowriter_catalog i where available and embedding is not null and index_version=p_version order by distance,i.id limit 20)x),
 lexical as(select c.n,x.id,row_number() over(partition by c.n order by x.rank desc,x.id) r from channels c cross join lateral(select i.id,ts_rank_cd(i.search_text,websearch_to_tsquery('english',c.q)) rank from public.cowriter_catalog i where available and index_version=p_version and i.search_text@@websearch_to_tsquery('english',c.q) order by rank desc,i.id limit 20)x),
 scores as(select id,sum(1.0/(60+r)) score from(select id,r from dense union all select id,r from lexical)r group by id),
 ranked as(select i.id,i.description,i.affordances,i.family,i.storage_path,i.width,i.height,s.score from scores s join public.cowriter_catalog i using(id) order by score desc,id limit 40)
 select coalesce(jsonb_agg(ranked),'[]') into result from ranked;
 return result;
end $$;
create function public.cowriter_search(p_vectors jsonb,p_queries text[],p_version text) returns jsonb language sql security invoker set search_path='' as $$select private.cowriter_search(p_vectors,p_queries,p_version)$$;
create function private.cowriter_import(p_key text,p_rows jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare r jsonb; n integer:=0;
begin
 perform private.check_humor_writer(p_key);perform private.require_superadmin();
 if jsonb_array_length(p_rows)>50 then raise exception 'Batch too large.'; end if;
 for r in select * from jsonb_array_elements(p_rows) loop
 insert into public.cowriter_catalog(id,source_url,source_hash,description,description_origin,affordances,family,storage_path,width,height,available,embedding,index_version)
 values((r->>'id')::uuid,r->>'source_url',r->>'source_hash',r->>'description',r->>'description_origin',coalesce(r->>'affordances',''),r->>'family',r->>'storage_path',(r->>'width')::integer,(r->>'height')::integer,(r->>'available')::boolean,(r->'embedding')::text::extensions.vector(768),r->>'index_version')
 on conflict(id) do update set source_hash=excluded.source_hash,description=excluded.description,description_origin=excluded.description_origin,affordances=excluded.affordances,family=excluded.family,storage_path=excluded.storage_path,width=excluded.width,height=excluded.height,available=excluded.available,embedding=excluded.embedding,index_version=excluded.index_version,updated_at=now();n=n+1;
 end loop;return n;
end $$;
create function public.cowriter_import(p_key text,p_rows jsonb) returns integer language sql security invoker set search_path='' as $$select private.cowriter_import(p_key,p_rows)$$;
create function private.cowriter_admin(p_enabled boolean default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_superadmin();
 if p_enabled is not null then update private.cowriter_settings set enabled=p_enabled where singleton; end if;
 return jsonb_build_object('enabled',(select enabled from private.cowriter_settings where singleton),
 'catalog',(select jsonb_build_object('total',count(*),'available',count(*)filter(where available),'embedded',count(*)filter(where embedding is not null),'backfilled',count(*)filter(where description_origin='backfill'),'missing',count(*)filter(where description_origin='missing'),'index_version',max(index_version))from public.cowriter_catalog),
 'summary',(select jsonb_build_object('attempts',count(*),'completed',count(*)filter(where status='ready'),'failed',count(*)filter(where status='failed'),'p95_ms',percentile_cont(.95)within group(order by (metrics->>'elapsed_ms')::numeric)filter(where status='ready' and action='draft'))from private.cowriter_requests where created_at>now()-interval '7 days'),
 'runs',(select coalesce(jsonb_agg(t),'[]') from(select r.id,r.session_id,r.action,r.status,r.metrics,r.error,r.created_at,s.state->'input'->>'mode' mode from private.cowriter_requests r join private.cowriter_sessions s on s.id=r.session_id order by r.created_at desc limit 100)t),
 'feedback',(select coalesce(jsonb_agg(t),'[]')from(select reason,count(*) total from private.cowriter_feedback group by reason)t));
end $$;
create function public.cowriter_admin(p_enabled boolean default null) returns jsonb language sql security invoker set search_path='' as $$select private.cowriter_admin(p_enabled)$$;

-- Revoke default PUBLIC execution for both layers; expose invoker wrappers only.
do $$declare f record;begin
 for f in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('private','public') and p.proname like 'cowriter_%' loop
 execute format('revoke all on function %I.%I(%s) from public,anon,authenticated',f.nspname,f.proname,f.args);
 execute format('grant execute on function %I.%I(%s) to authenticated',f.nspname,f.proname,f.args);
 end loop;end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('cowriter-uploads','cowriter-uploads',false,2097152,array['image/jpeg']),('cowriter-catalog','cowriter-catalog',true,2097152,array['image/jpeg']) on conflict(id) do nothing;
create policy cowriter_upload_insert on storage.objects for insert to authenticated with check(bucket_id='cowriter-uploads' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy cowriter_upload_read on storage.objects for select to authenticated using(bucket_id='cowriter-uploads' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy cowriter_upload_delete on storage.objects for delete to authenticated using(bucket_id='cowriter-uploads' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy cowriter_catalog_insert on storage.objects for insert to authenticated with check(bucket_id='cowriter-catalog' and private.admin_access());
create policy cowriter_catalog_update on storage.objects for update to authenticated using(bucket_id='cowriter-catalog' and private.admin_access()) with check(bucket_id='cowriter-catalog' and private.admin_access());
create policy cowriter_catalog_admin_read on storage.objects for select to authenticated using(bucket_id='cowriter-catalog' and private.admin_access());
