-- Permit one bounded source revision; preserve capability, lease and size guards.
create or replace function humor_worker.checkpoint(p_key text,p_run uuid,p_token uuid,p_stage text,p_value jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform humor_worker.authorize(p_key);
  if p_stage not in ('input_manifest','baseline','scene','conflicts','associations_image','associations_description','retrieval_graph',
    'merge_paths','source_review','source_revision','candidates','judge','schema_repair_used','runtime_receipt') or p_value is null or octet_length(p_value::text)>180000 then
    raise exception 'Invalid checkpoint.';
  end if;
  update private.humor_jobs set checkpoints=jsonb_set(checkpoints,array[p_stage],p_value),lease_until=now()+interval '120 seconds'
    where run_id=p_run and lease_token=p_token and lease_until>now() and state='leased';
  if not found then raise exception 'Worker lease expired.' using errcode='42501'; end if;
end $$;
