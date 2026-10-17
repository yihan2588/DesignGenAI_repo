-- Add request-driven leases and an owner allowlist for canary verification.
-- Activation and source eligibility remain explicit release operations.
alter table private.humor_worker_config add column dispatch_mode text not null default 'poll' check(dispatch_mode in ('poll','vercel_queue'));
alter table private.humor_worker_config add column canary_user_ids uuid[] not null default '{}';
create or replace function private.humor_enqueue(p_run uuid,p_key text) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.humor_runs; cfg private.humor_worker_config;
begin
  perform private.check_humor_writer(p_key);
  select * into cfg from private.humor_worker_config;
  if not cfg.enabled or not cfg.production_corpus_approved or (cfg.dispatch_mode='poll' and not exists(select 1 from private.humor_workers where last_seen>now()-interval '60 seconds')) then
    raise exception 'The guided worker is unavailable.';
  end if;
  if cardinality(cfg.canary_user_ids)>0 and not coalesce(auth.uid()=any(cfg.canary_user_ids),false) then
    raise exception 'The new pipeline is in a limited test.' using errcode='42501';
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


create function humor_worker.claim_run(p_key text,p_worker uuid,p_run uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.humor_jobs; r public.humor_runs; token uuid:=gen_random_uuid();
begin
  perform humor_worker.ping(p_key,p_worker);
  if not (select enabled and production_corpus_approved from private.humor_worker_config) then return null; end if;
  select * into job from private.humor_jobs where run_id=p_run for update;
  if not found then raise exception 'Job not found.'; end if;
  select * into r from public.humor_runs where id=p_run;
  if job.state in ('ready','failed') then return jsonb_build_object('terminal',true,'status',job.state); end if;
  if job.deadline_at<now() or job.attempts>=3 or r.status<>'generating' or r.owner_id<>job.owner_id then
    -- An active third lease may still finish; only a later expired delivery reaps it.
    if job.state='leased' and job.lease_until>now() then return null; end if;
    update private.humor_jobs set state='failed',lease_token=null,lease_until=null where run_id=p_run;
    update public.humor_runs set status='failed',finished_at=now(),error_message='Generation was interrupted. Your image is saved; please retry.' where id=p_run and status<>'ready';
    return jsonb_build_object('terminal',true,'status','failed');
  end if;
  if job.state='leased' and job.lease_until>now() then return null; end if;
  update private.humor_jobs set state='leased',worker_id=p_worker,lease_token=token,
    lease_until=now()+interval '120 seconds',attempts=attempts+1 where run_id=p_run;
  return jsonb_build_object('run_id',job.run_id,'owner_id',job.owner_id,'lease_token',token,
    'checkpoints',job.checkpoints,'config',job.config,
    'model_attempts',(select count(*) from private.humor_model_calls where run_id=p_run),
    'storage_path',(select storage_path from public.humor_images where id=r.image_id));
end $$;
create function public.humor_worker_claim_run(p_key text,p_worker uuid,p_run uuid) returns jsonb
language sql security invoker set search_path='' as $$ select humor_worker.claim_run(p_key,p_worker,p_run) $$;
revoke all on function humor_worker.claim_run(text,uuid,uuid),public.humor_worker_claim_run(text,uuid,uuid) from public,anon,authenticated;
grant execute on function humor_worker.claim_run(text,uuid,uuid),public.humor_worker_claim_run(text,uuid,uuid) to anon,authenticated;

-- Read-only, capability-protected export for a Vercel build. Original jokes never enter Git.
create function humor_worker.export_batch(p_key text,p_offset integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform humor_worker.authorize(p_key);
  if p_offset is null or p_offset<0 or p_offset>20000 then raise exception 'Invalid offset.'; end if;
  return coalesce((select jsonb_agg(row_data order by row_data->>'id') from (
    select jsonb_build_object('id',e.id,'text',e.full_joke,'text_sha256',e.text_sha256,
      'situation_text',e.situation_text,'mechanism_text',e.mechanism_text,'annotation',e.annotation,
      'corpus_version',e.corpus_version,'language',e.language,'split',e.split,'allowed_use',e.allowed_use,
      'heldout_overlap',e.heldout_overlap,'production_eligible',e.production_eligible,
      'full_embedding',e.full_embedding::text::jsonb,'situation_embedding',e.situation_embedding::text::jsonb,
      'mechanism_embedding',e.mechanism_embedding::text::jsonb) row_data
    from private.joke_examples e join private.joke_sources s on s.source_id=e.source_id
    where e.corpus_version=(select corpus_version from private.humor_worker_config)
      and e.allowed_use and e.production_eligible and s.production_approved and e.split='train'
      and e.language='en' and not e.heldout_overlap
    order by e.id limit 20 offset p_offset
  ) batch),'[]'::jsonb);
end $$;
create function public.humor_worker_export_batch(p_key text,p_offset integer) returns jsonb
language sql security invoker set search_path='' as $$ select humor_worker.export_batch(p_key,p_offset) $$;
revoke all on function humor_worker.export_batch(text,integer),public.humor_worker_export_batch(text,integer) from public,anon,authenticated;
grant execute on function humor_worker.export_batch(text,integer),public.humor_worker_export_batch(text,integer) to anon,authenticated;
