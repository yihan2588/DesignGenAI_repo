-- Existing titles remain valid. New uploads request AI metadata with null title/alt.
alter table public.humor_images add column metadata_pending boolean not null default false;

create or replace function private.humor_create_upload(p_path text,p_title text,p_alt text,p_request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_image uuid; v_run uuid; v_user uuid:=auth.uid();
begin
  if v_user is null or p_path is null or p_path !~ ('^'||v_user::text||'/[0-9a-f-]{36}\.jpg$') then raise exception 'Sign in to upload.' using errcode='42501'; end if;
  if (p_title is null) <> (p_alt is null) then raise exception 'Provide both metadata fields or request image analysis.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('humor-create-'||v_user::text,0));
  select id into v_run from public.humor_runs where owner_id=v_user and request_key=p_request;
  if found then return v_run; end if;
  if not exists(select 1 from storage.objects where bucket_id='humor-images' and name=p_path) then raise exception 'Uploaded image not found.'; end if;
  insert into public.humor_images(owner_id,title,alt_text,storage_path,metadata_pending)
    values(v_user,coalesce(p_title,'Image awaiting analysis'),coalesce(p_alt,'Uploaded image awaiting an AI description.'),p_path,p_title is null) returning id into v_image;
  return private.humor_new_run(v_image,p_request);
end $$;

create or replace function private.humor_finish(p_run uuid,p_token uuid,p_key text,p_result jsonb,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
declare v_a boolean:=random()<0.5; r public.humor_runs; v_metadata jsonb; v_title text; v_description text;
begin
  perform private.check_humor_writer(p_key);
  select * into r from public.humor_runs where id=p_run and owner_id=auth.uid() and status='generating' for update;
  if not found or not exists(select 1 from private.humor_run_details where run_id=p_run and attempt_token=p_token) then raise exception 'Generation attempt expired.'; end if;
  if p_error is not null then
    update public.humor_runs set status='failed',finished_at=now(),error_message=left(p_error,240) where id=p_run;
    return;
  end if;
  if r.deadline_at<now() then raise exception 'Generation attempt expired.'; end if;
  v_metadata:=p_result->'metadata';
  if v_metadata is not null or (select metadata_pending from public.humor_images where id=r.image_id) then
    if jsonb_typeof(v_metadata->'title') is distinct from 'string' or jsonb_typeof(v_metadata->'description') is distinct from 'string' then
      raise exception 'Valid image metadata is required.';
    end if;
    v_title:=btrim(v_metadata->>'title'); v_description:=btrim(v_metadata->>'description');
    if length(v_title) not between 1 and 100 or length(v_description) not between 1 and 300 or v_title ~ '[<>]' or v_description ~ '[<>]' then
      raise exception 'Valid image metadata is required.';
    end if;
    update public.humor_images set title=v_title,alt_text=v_description,metadata_pending=false where id=r.image_id;
  end if;
  -- Metadata, the hidden assignment, and both captions commit together.
  update private.humor_run_details set result=p_result,baseline_slot=case when v_a then 'A' else 'B' end where run_id=p_run;
  update public.humor_runs set status='ready',finished_at=now(),error_message=null,
    caption_a=case when v_a then p_result->>'baseline' else p_result->>'guided' end,
    caption_b=case when v_a then p_result->>'guided' else p_result->>'baseline' end where id=p_run;
end $$;

create or replace function private.humor_poll(p_run uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_choice text; v_a integer; v_b integer; v_baseline text;
begin
  if auth.uid() is null then raise exception 'Sign in to vote.' using errcode='42501'; end if;
  select choice into v_choice from public.humor_votes where run_id=p_run and user_id=auth.uid();
  if not found then raise exception 'Choose a caption to reveal the poll.' using errcode='42501'; end if;
  -- Never return the mapping or aggregates before this account's saved vote.
  select baseline_slot into v_baseline from private.humor_run_details where run_id=p_run;
  select count(*) filter(where choice='A'),count(*) filter(where choice='B') into v_a,v_b from public.humor_votes where run_id=p_run;
  return jsonb_build_object('choice',v_choice,'a',v_a,'b',v_b,'total',v_a+v_b,'baseline_slot',v_baseline);
end $$;

-- CREATE OR REPLACE preserves the existing restricted function grants.
