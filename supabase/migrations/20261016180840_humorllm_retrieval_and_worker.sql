-- Additive research library and opt-in worker. Public generation remains disabled here.
create extension if not exists vector with schema extensions;
create schema humor_worker;
revoke all on schema humor_worker from public;
grant usage on schema humor_worker to anon,authenticated;

create table private.humor_worker_config (
  singleton boolean primary key default true check(singleton),
  worker_key_sha256 text check(worker_key_sha256 ~ '^[0-9a-f]{64}$'),
  enabled boolean not null default false,
  ingest_enabled boolean not null default false,
  production_corpus_approved boolean not null default false,
  budget_limit_usd numeric not null default 25 check(budget_limit_usd>0 and budget_limit_usd<=25),
  prior_spent_usd numeric not null default 0.2039485 check(prior_spent_usd>=0),
  corpus_version text not null default 'cleancomedy-en-annotations-v2',
  pipeline_config jsonb not null default '{"model":"gemini-3.1-flash-lite","retrieval_method":"full_dense"}'::jsonb
    check(jsonb_typeof(pipeline_config)='object')
);
insert into private.humor_worker_config(singleton) values(true);
create table private.joke_sources (
  source_id text primary key,
  url text not null,
  attribution text not null,
  license_scope text not null,
  production_approved boolean not null default false
);
insert into private.joke_sources values('cleancomedy-en','https://github.com/gorovuha/CleanComedy/tree/main/english',
  'gorovuha/CleanComedy contributors','Repository declares CC-BY-4.0; upstream per-item provenance unresolved; private research only.',false);
create table private.joke_examples (
  corpus_version text not null,
  id text not null,
  source_id text not null references private.joke_sources(source_id),
  text_sha256 text not null check(text_sha256 ~ '^[0-9a-f]{64}$'),
  full_joke text not null check(length(full_joke) between 1 and 2000),
  situation_text text not null check(length(situation_text) between 1 and 1000),
  mechanism_text text not null check(length(mechanism_text) between 1 and 1000),
  annotation jsonb not null check(jsonb_typeof(annotation)='object'),
  language text not null default 'en',
  split text not null default 'train' check(split in ('train','validation','test')),
  allowed_use boolean not null default false,
  heldout_overlap boolean not null default false,
  production_eligible boolean not null default false,
  embedding_model text not null check(embedding_model='sentence-transformers/all-mpnet-base-v2'),
  embedding_revision text not null check(embedding_revision='e8c3b32edf5434bc2275fc9bab85f82640a19130'),
  full_embedding extensions.vector(768) not null check(abs(extensions.vector_norm(full_embedding)-1)<0.0001),
  situation_embedding extensions.vector(768) not null check(abs(extensions.vector_norm(situation_embedding)-1)<0.0001),
  mechanism_embedding extensions.vector(768) not null check(abs(extensions.vector_norm(mechanism_embedding)-1)<0.0001),
  fts tsvector generated always as (to_tsvector('english',situation_text||' '||mechanism_text||' '||full_joke)) stored,
  primary key(corpus_version,id), unique(corpus_version,text_sha256)
);
-- Exact vector scans are intentional for this small pilot; no HNSW/recall claim.
create index joke_examples_fts_idx on private.joke_examples using gin(fts);
create table private.humor_workers (
  id uuid primary key,
  last_seen timestamptz not null default now()
);
create table private.humor_jobs (
  run_id uuid primary key references public.humor_runs(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  state text not null default 'queued' check(state in ('queued','leased','ready','failed')),
  created_at timestamptz not null default now(),
  deadline_at timestamptz not null default now()+interval '15 minutes',
  worker_id uuid references private.humor_workers(id),
  lease_token uuid,
  lease_until timestamptz,
  attempts integer not null default 0 check(attempts between 0 and 3),
  checkpoints jsonb not null default '{}' check(jsonb_typeof(checkpoints)='object'),
  config jsonb not null check(jsonb_typeof(config)='object')
);
create table private.humor_model_calls (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references private.humor_jobs(run_id) on delete cascade,
  stage text not null check(length(stage) between 1 and 80),
  reserved_usd numeric not null default 0.10 check(reserved_usd=0.10),
  actual_usd numeric check(actual_usd>=0),
  created_at timestamptz not null default now()
);
create index humor_model_calls_run_idx on private.humor_model_calls(run_id);
create index humor_jobs_claim_idx on private.humor_jobs(state,created_at) where state in ('queued','leased');
create index humor_jobs_owner_idx on private.humor_jobs(owner_id);
create index humor_jobs_worker_idx on private.humor_jobs(worker_id);

do $$ declare t text; begin
  foreach t in array array['humor_worker_config','joke_sources','joke_examples','humor_workers','humor_jobs','humor_model_calls'] loop
    execute format('alter table private.%I enable row level security',t);
    execute format('revoke all on private.%I from public,anon,authenticated',t);
  end loop;
end $$;

create function humor_worker.authorize(p_key text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_key is null or length(p_key) not between 32 and 256 or not exists(
    select 1 from private.humor_worker_config where worker_key_sha256=encode(extensions.digest(p_key,'sha256'),'hex')) then
    raise exception 'Worker access denied.' using errcode='42501';
  end if;
end $$;

create function humor_worker.ingest(p_key text,p_version text,p_rows jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare r jsonb; n integer:=0; changed integer;
begin
  perform humor_worker.authorize(p_key);
  if not (select ingest_enabled from private.humor_worker_config) then raise exception 'Ingestion is disabled.' using errcode='42501'; end if;
  if p_version is distinct from (select corpus_version from private.humor_worker_config) or
     jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 20 or
     octet_length(p_rows::text)>2000000 then raise exception 'Invalid ingestion batch.'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    if (r->>'id') !~ '^cc-en-[0-9]{5}$' or r->'annotation'->>'decision' is distinct from 'include' or
       r->'annotation'->'risk_flags' is distinct from '[]'::jsonb or
       r->>'text_sha256' is distinct from encode(extensions.digest(r->>'text','sha256'),'hex') or
       r->>'embedding_model' is distinct from 'sentence-transformers/all-mpnet-base-v2' or
       r->>'embedding_revision' is distinct from 'e8c3b32edf5434bc2275fc9bab85f82640a19130' then
      raise exception 'Invalid research candidate.';
    end if;
    if exists(select 1 from private.joke_examples e where e.corpus_version=p_version and e.id=r->>'id' and e.text_sha256<>r->>'text_sha256') then
      raise exception 'Immutable corpus ID changed; use a new corpus version.';
    end if;
    insert into private.joke_examples(corpus_version,id,source_id,text_sha256,full_joke,situation_text,mechanism_text,annotation,
      allowed_use,embedding_model,embedding_revision,full_embedding,situation_embedding,mechanism_embedding)
    values(p_version,r->>'id','cleancomedy-en',r->>'text_sha256',r->>'text',r->>'situation_text',r->>'mechanism_text',r->'annotation',
      true,r->>'embedding_model',r->>'embedding_revision',(r->>'full_embedding')::extensions.vector,
      (r->>'situation_embedding')::extensions.vector,(r->>'mechanism_embedding')::extensions.vector)
    on conflict(corpus_version,id) do nothing;
    get diagnostics changed=row_count;n:=n+changed;
  end loop;
  return n;
end $$;

create function humor_worker.search(p_key text,p_corpus text,p_query text,p_situation extensions.vector(768),
  p_mechanism extensions.vector(768),p_method text default 'full_dense',p_scope text default 'research',p_count integer default 5)
returns table(source_id text,text_sha256 text,rank integer,score double precision)
language plpgsql stable security definer set search_path='' as $$
declare tsq tsquery;
begin
  perform humor_worker.authorize(p_key);
  if p_scope is null or p_method is null or p_count is null or p_query is null or p_corpus is null or p_scope not in ('research','production') or p_method not in ('full_dense','hybrid') or
     p_count not between 1 and 20 or length(p_query)>8000 or p_situation is null or p_mechanism is null or
     extensions.vector_dims(p_situation)<>768 or extensions.vector_dims(p_mechanism)<>768 or
     abs(extensions.vector_norm(p_situation)-1)>0.0001 or abs(extensions.vector_norm(p_mechanism)-1)>0.0001 then
    raise exception 'Invalid retrieval query.';
  end if;
  if p_method='full_dense' then
    return query select e.id,e.text_sha256,row_number() over(order by e.full_embedding operator(extensions.<=>) p_situation,e.id)::integer,
      (1-(e.full_embedding operator(extensions.<=>) p_situation))::double precision
      from private.joke_examples e join private.joke_sources s on s.source_id=e.source_id
      where e.corpus_version=p_corpus and e.allowed_use and e.language='en' and e.split='train' and not e.heldout_overlap
        and (p_scope='research' or (e.production_eligible and s.production_approved))
      order by e.full_embedding operator(extensions.<=>) p_situation,e.id limit p_count;
    return;
  end if;
  select to_tsquery('english',coalesce(string_agg(quote_literal(word),' | '),'')) into tsq
    from (select distinct token as word from regexp_split_to_table(lower(p_query),'[^[:alnum:]]+') token
          where length(token)>1 limit 64) words;
  return query with eligible as materialized (
    select e.* from private.joke_examples e join private.joke_sources s on s.source_id=e.source_id
    where e.corpus_version=p_corpus and e.allowed_use and e.language='en' and e.split='train' and not e.heldout_overlap
      and (p_scope='research' or (e.production_eligible and s.production_approved))
  ), lex as (
    select e.id,row_number() over(order by ts_rank_cd(e.fts,tsq) desc,e.id) r
    from eligible e where e.fts@@tsq order by ts_rank_cd(e.fts,tsq) desc,e.id limit 20
  ), situation as (
    select e.id,row_number() over(order by e.situation_embedding operator(extensions.<=>) p_situation,e.id) r
    from eligible e order by e.situation_embedding operator(extensions.<=>) p_situation,e.id limit 20
  ), mechanism as (
    select e.id,row_number() over(order by e.mechanism_embedding operator(extensions.<=>) p_mechanism,e.id) r
    from eligible e order by e.mechanism_embedding operator(extensions.<=>) p_mechanism,e.id limit 20
  ), combined as (
    select id,sum(1.0/(50+r))::double precision total from
      (select * from lex union all select * from situation union all select * from mechanism) channels group by id
  ) select e.id,e.text_sha256,row_number() over(order by c.total desc,e.id)::integer,c.total
    from combined c join eligible e on e.id=c.id order by c.total desc,e.id limit p_count;
end $$;

create function humor_worker.ping(p_key text,p_worker uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform humor_worker.authorize(p_key);
  if p_worker is null then raise exception 'Invalid worker.'; end if;
  insert into private.humor_workers(id,last_seen) values(p_worker,now()) on conflict(id) do update set last_seen=excluded.last_seen;
end $$;

create function private.humor_enqueue(p_run uuid,p_key text) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.humor_runs; cfg private.humor_worker_config;
begin
  perform private.check_humor_writer(p_key);
  select * into cfg from private.humor_worker_config;
  if not cfg.enabled or not cfg.production_corpus_approved or not exists(select 1 from private.humor_workers where last_seen>now()-interval '60 seconds') then
    raise exception 'The guided worker is unavailable.';
  end if;
  select * into r from public.humor_runs where id=p_run and owner_id=auth.uid() for update;
  if not found then raise exception 'Run not found.' using errcode='42501'; end if;
  if r.status='ready' or exists(select 1 from private.humor_jobs where run_id=p_run) then return p_run; end if;
  if r.status<>'pending' then raise exception 'Run cannot be enqueued.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('humor-project-budget',0));
  if (select count(*) from public.humor_runs where deadline_at>now()-interval '24 hours') >=
     (select daily_project_limit from private.humor_config) then raise exception 'The demo has reached its daily generation limit.'; end if;
  insert into private.humor_jobs(run_id,owner_id,config) values(r.id,r.owner_id,cfg.pipeline_config||jsonb_build_object('corpus_version',cfg.corpus_version));
  update public.humor_runs set status='generating',deadline_at=now()+interval '15 minutes' where id=r.id;
  return r.id;
end $$;

create function humor_worker.claim(p_key text,p_worker uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.humor_jobs; token uuid:=gen_random_uuid(); expired uuid[];
begin
  perform humor_worker.ping(p_key,p_worker);
  if not (select enabled from private.humor_worker_config) then return null; end if;
  -- Reaping does not touch completed pairs; old workers lose their lease tokens.
  with stale as (select j.run_id from private.humor_jobs j where j.state in ('queued','leased') and
    (j.deadline_at<now() or (j.attempts>=3 and j.lease_until<now()) or not exists(select 1 from public.humor_runs r where r.id=j.run_id and r.status='generating')) for update skip locked),
  changed as (update private.humor_jobs j set state='failed',lease_token=null,lease_until=null
    from stale where j.run_id=stale.run_id returning j.run_id)
  select array_agg(run_id) into expired from changed;
  update public.humor_runs set status='failed',finished_at=now(),error_message='Generation was interrupted. Your image is saved; please retry.'
    where id=any(coalesce(expired,'{}'::uuid[])) and status<>'ready';
  select * into job from private.humor_jobs j where (j.state='queued' or (j.state='leased' and j.lease_until<now()))
    and j.attempts<3 and j.deadline_at>now() and exists(select 1 from public.humor_runs r where r.id=j.run_id and r.status='generating') order by j.created_at,j.run_id limit 1 for update skip locked;
  if not found then return null; end if;
  update private.humor_jobs set state='leased',worker_id=p_worker,lease_token=token,lease_until=now()+interval '120 seconds',attempts=attempts+1
    where run_id=job.run_id;
  return jsonb_build_object('run_id',job.run_id,'owner_id',job.owner_id,'lease_token',token,'checkpoints',job.checkpoints,'config',job.config,
    'model_attempts',(select count(*) from private.humor_model_calls where run_id=job.run_id),
    'storage_path',(select storage_path from public.humor_images where id=(select image_id from public.humor_runs where id=job.run_id)));
end $$;

create function humor_worker.checkpoint(p_key text,p_run uuid,p_token uuid,p_stage text,p_value jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform humor_worker.authorize(p_key);
  if p_stage not in ('input_manifest','baseline','scene','conflicts','associations_image','associations_description','retrieval_graph',
    'merge_paths','candidates','judge','schema_repair_used','runtime_receipt') or p_value is null or octet_length(p_value::text)>180000 then
    raise exception 'Invalid checkpoint.';
  end if;
  update private.humor_jobs set checkpoints=jsonb_set(checkpoints,array[p_stage],p_value),lease_until=now()+interval '120 seconds'
    where run_id=p_run and lease_token=p_token and lease_until>now() and state='leased';
  if not found then raise exception 'Worker lease expired.' using errcode='42501'; end if;
end $$;

-- Reserve before the HTTP request. Unknown usage remains charged at its full reservation.
create function humor_worker.reserve(p_key text,p_run uuid,p_token uuid,p_stage text) returns uuid
language plpgsql security definer set search_path='' as $$
declare reservation uuid; cfg private.humor_worker_config;
begin
  perform humor_worker.authorize(p_key);
  if p_stage is null or length(p_stage) not between 1 and 80 then raise exception 'Invalid stage.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('humor-worker-api-budget',0));
  perform 1 from private.humor_jobs where run_id=p_run and lease_token=p_token and state='leased' and lease_until>now() and deadline_at>now() for update;
  if not found then raise exception 'Worker lease expired.' using errcode='42501'; end if;
  if (select count(*) from private.humor_model_calls where run_id=p_run)>=10 then raise exception 'Model attempt limit reached.'; end if;
  select * into cfg from private.humor_worker_config;
  if cfg.prior_spent_usd+(select coalesce(sum(coalesce(actual_usd,reserved_usd)),0) from private.humor_model_calls)+0.10>cfg.budget_limit_usd then
    raise exception 'Qualification budget exhausted.';
  end if;
  insert into private.humor_model_calls(run_id,stage) values(p_run,p_stage) returning id into reservation;
  return reservation;
end $$;
create function humor_worker.settle(p_key text,p_run uuid,p_token uuid,p_reservation uuid,p_actual numeric) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform humor_worker.authorize(p_key);
  -- An expired worker may acknowledge its own already-issued cost, but cannot reserve or publish.
  if p_actual is null then return; end if;
  if p_actual<0 or p_actual>1 then raise exception 'Invalid provider cost.'; end if;
  perform 1 from private.humor_jobs where run_id=p_run and lease_token=p_token;
  if not found then raise exception 'Worker lease changed.' using errcode='42501'; end if;
  update private.humor_model_calls set actual_usd=p_actual where id=p_reservation and run_id=p_run and actual_usd is null;
  if not found and not exists(select 1 from private.humor_model_calls where id=p_reservation and run_id=p_run and actual_usd=p_actual) then
    raise exception 'Missing or changed reservation.';
  end if;
end $$;

create function humor_worker.finish(p_key text,p_run uuid,p_token uuid,p_result jsonb,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
declare job private.humor_jobs; r public.humor_runs; a boolean:=random()<0.5; v_title text; v_description text;
begin
  perform humor_worker.authorize(p_key);
  select * into job from private.humor_jobs where run_id=p_run and lease_token=p_token and lease_until>now() and state='leased' for update;
  if not found then raise exception 'Worker lease expired.' using errcode='42501'; end if;
  select * into r from public.humor_runs where id=p_run for update;
  if r.status<>'generating' or r.owner_id<>job.owner_id then raise exception 'Run cannot be completed.'; end if;
  if p_error is not null or p_result->>'status' is distinct from 'ready' then
    update private.humor_jobs set state='failed',lease_token=null,lease_until=null where run_id=p_run;
    update public.humor_runs set status='failed',finished_at=now(),error_message='The guided pipeline could not complete this comparison. Your image is saved; please retry.' where id=p_run;
    return;
  end if;
  if job.deadline_at<now() or not (select production_corpus_approved from private.humor_worker_config) or
    p_result->>'corpus_version' is distinct from job.config->>'corpus_version' or
    p_result->'production_eligible' is distinct from 'true'::jsonb or octet_length(p_result::text)>1500000 then raise exception 'Run qualification or deadline failed.'; end if;
  if jsonb_typeof(p_result->'baseline') is distinct from 'string' or jsonb_typeof(p_result->'guided') is distinct from 'string' or
    length(btrim(p_result->>'baseline')) not between 1 and 240 or length(btrim(p_result->>'guided')) not between 1 and 240 or
    lower(regexp_replace(p_result->>'baseline','[^[:alnum:]]','','g'))=lower(regexp_replace(p_result->>'guided','[^[:alnum:]]','','g')) then
    raise exception 'Invalid caption pair.';
  end if;
  v_title:=btrim(p_result->'metadata'->>'title');v_description:=btrim(p_result->'metadata'->>'description');
  if jsonb_typeof(p_result->'metadata'->'title') is distinct from 'string' or jsonb_typeof(p_result->'metadata'->'description') is distinct from 'string' or v_title is null or v_description is null or length(v_title) not between 1 and 100 or length(v_description) not between 1 and 300 or v_title~'[<>]' or v_description~'[<>]' then
    raise exception 'Invalid neutral metadata.';
  end if;
  update public.humor_images set title=v_title,alt_text=v_description,metadata_pending=false where id=r.image_id and metadata_pending;
  update private.humor_run_details set result=p_result,stages=coalesce(p_result->'steps','[]'),baseline_slot=case when a then 'A' else 'B' end where run_id=p_run;
  update public.humor_runs set status='ready',finished_at=now(),error_message=null,
    caption_a=case when a then p_result->>'baseline' else p_result->>'guided' end,
    caption_b=case when a then p_result->>'guided' else p_result->>'baseline' end where id=p_run;
  update private.humor_jobs set state='ready',lease_token=null,lease_until=null where run_id=p_run;
end $$;

-- Thin public invokers. Privileged code stays in the dedicated, non-exposed worker schema.
create function public.humor_enqueue(p_run uuid,p_key text) returns uuid language sql security invoker set search_path='' as $$ select private.humor_enqueue(p_run,p_key) $$;
create function public.humor_worker_ping(p_key text,p_worker uuid) returns void language sql security invoker set search_path='' as $$ select humor_worker.ping(p_key,p_worker) $$;
create function public.humor_worker_claim(p_key text,p_worker uuid) returns jsonb language sql security invoker set search_path='' as $$ select humor_worker.claim(p_key,p_worker) $$;
create function public.humor_worker_checkpoint(p_key text,p_run uuid,p_token uuid,p_stage text,p_value jsonb) returns void language sql security invoker set search_path='' as $$ select humor_worker.checkpoint(p_key,p_run,p_token,p_stage,p_value) $$;
create function public.humor_worker_reserve(p_key text,p_run uuid,p_token uuid,p_stage text) returns uuid language sql security invoker set search_path='' as $$ select humor_worker.reserve(p_key,p_run,p_token,p_stage) $$;
create function public.humor_worker_settle(p_key text,p_run uuid,p_token uuid,p_reservation uuid,p_actual numeric) returns void language sql security invoker set search_path='' as $$ select humor_worker.settle(p_key,p_run,p_token,p_reservation,p_actual) $$;
create function public.humor_worker_finish(p_key text,p_run uuid,p_token uuid,p_result jsonb,p_error text default null) returns void language sql security invoker set search_path='' as $$ select humor_worker.finish(p_key,p_run,p_token,p_result,p_error) $$;
create function public.humor_retrieval_search(p_key text,p_corpus text,p_query text,p_situation extensions.vector(768),p_mechanism extensions.vector(768),p_method text default 'full_dense',p_scope text default 'research',p_count integer default 5)
returns table(source_id text,text_sha256 text,rank integer,score double precision) language sql security invoker set search_path='' as $$ select * from humor_worker.search(p_key,p_corpus,p_query,p_situation,p_mechanism,p_method,p_scope,p_count) $$;
create function public.humor_ingest_examples(p_key text,p_version text,p_rows jsonb) returns integer language sql security invoker set search_path='' as $$ select humor_worker.ingest(p_key,p_version,p_rows) $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='humor_worker') or (n.nspname in ('public','private') and p.proname in
      ('humor_enqueue','humor_worker_ping','humor_worker_claim','humor_worker_checkpoint','humor_worker_finish','humor_worker_reserve','humor_worker_settle','humor_retrieval_search','humor_ingest_examples')) loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    if f.proname='humor_enqueue' then execute format('grant execute on function %s to authenticated',f.signature);
    elsif f.proname<>'authorize' then execute format('grant execute on function %s to anon,authenticated',f.signature); end if;
  end loop;
end $$;
