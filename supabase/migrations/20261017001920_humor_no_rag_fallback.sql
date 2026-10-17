-- Add source-free fallback checkpoints and two bounded calls; retain the shared $25 cap.
-- This migration does NOT activate a worker or approve any source/corpus.
create or replace function humor_worker.checkpoint(p_key text,p_run uuid,p_token uuid,p_stage text,p_value jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform humor_worker.authorize(p_key);
  if p_stage not in ('input_manifest','baseline','scene','conflicts','associations_image','associations_description','retrieval_graph',
    'merge_paths','source_review','source_revision','candidates','judge','fallback_candidates','fallback_judge','schema_repair_used','runtime_receipt') or p_value is null or octet_length(p_value::text)>(case when p_stage='runtime_receipt' then 1200000 else 180000 end) then
    raise exception 'Invalid checkpoint.';
  end if;
  update private.humor_jobs set checkpoints=jsonb_set(checkpoints,array[p_stage],p_value),lease_until=now()+interval '120 seconds'
    where run_id=p_run and lease_token=p_token and lease_until>now() and state='leased';
  if not found then raise exception 'Worker lease expired.' using errcode='42501'; end if;
end $$;

create or replace function humor_worker.reserve(p_key text,p_run uuid,p_token uuid,p_stage text) returns uuid
language plpgsql security definer set search_path='' as $$
declare reservation uuid; cfg private.humor_worker_config;
begin
  perform humor_worker.authorize(p_key);
  if p_stage is null or length(p_stage) not between 1 and 80 then raise exception 'Invalid stage.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('humor-worker-api-budget',0));
  perform 1 from private.humor_jobs where run_id=p_run and lease_token=p_token and state='leased' and lease_until>now() and deadline_at>now() for update;
  if not found then raise exception 'Worker lease expired.' using errcode='42501'; end if;
  if (select count(*) from private.humor_model_calls where run_id=p_run)>=12 then raise exception 'Model attempt limit reached.'; end if;
  select * into cfg from private.humor_worker_config;
  if cfg.prior_spent_usd+(select coalesce(sum(coalesce(actual_usd,reserved_usd)),0) from private.humor_model_calls)+0.10>cfg.budget_limit_usd then
    raise exception 'Qualification budget exhausted.';
  end if;
  insert into private.humor_model_calls(run_id,stage) values(p_run,p_stage) returning id into reservation;
  return reservation;
end $$;

create or replace function humor_worker.finish(p_key text,p_run uuid,p_token uuid,p_result jsonb,p_error text default null) returns void
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
  -- A fallback is a valid guided comparison, never a verified retrieval contribution.
  if p_result->>'guided_mode' is null or p_result->>'guided_mode' not in ('rag','no_rag_fallback') or
    jsonb_typeof(p_result->'selected_caption_source_ids') is distinct from 'array' or
    jsonb_typeof(p_result->'retrieval_evidence_ids') is distinct from 'array' then
    raise exception 'Invalid guided provenance.';
  end if;
  if p_result->>'guided_mode'='rag' then
    if jsonb_array_length(p_result->'selected_caption_source_ids')=0 or
       jsonb_array_length(p_result->'retrieval_evidence_ids')=0 then raise exception 'Missing retrieval contribution.'; end if;
  else
    if p_result->'selected_caption_source_ids'<>'[]'::jsonb or
       p_result->'retrieval_evidence_ids'<>'[]'::jsonb or
       p_result->'fallback'->'source_free' is distinct from 'true'::jsonb then
      raise exception 'Invalid fallback provenance.';
    end if;
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


-- Align future jobs with the tested model and retrieval mode while generation is disabled.
alter table private.humor_worker_config alter column pipeline_config set default
  '{"model":"gemini-3.8-flash","retrieval_method":"balanced_rerank"}'::jsonb;
update private.humor_worker_config set pipeline_config=pipeline_config ||
  '{"model":"gemini-3.8-flash","retrieval_method":"balanced_rerank"}'::jsonb where not enabled;
