-- Additive HumorLLM domain. Existing food photos, captions and votes are untouched.
create table public.humor_images (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  alt_text text not null check (char_length(btrim(alt_text)) between 1 and 300),
  storage_path text not null unique,
  attribution text,
  created_at timestamptz not null default now(),
  check (storage_path ~ ('^' || owner_id::text || '/[0-9a-f-]{36}\.jpg$'))
);
create table public.humor_runs (
  id uuid primary key default gen_random_uuid(),
  image_id uuid not null references public.humor_images(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','generating','ready','failed')),
  caption_a text, caption_b text,
  is_example boolean not null default false,
  request_key uuid not null,
  parent_id uuid references public.humor_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  deadline_at timestamptz,
  error_message text,
  unique (owner_id,request_key),
  check (status <> 'ready' or (char_length(btrim(caption_a)) between 1 and 240 and char_length(btrim(caption_b)) between 1 and 240 and caption_a <> caption_b)),
  check (status <> 'ready' or (caption_a is not null and caption_b is not null))
);
create index humor_runs_feed_idx on public.humor_runs(created_at desc,id desc) where status='ready';
create index humor_runs_owner_idx on public.humor_runs(owner_id,created_at desc);
create index humor_runs_image_idx on public.humor_runs(image_id);
create index humor_runs_parent_idx on public.humor_runs(parent_id);
create index humor_images_owner_idx on public.humor_images(owner_id);
create table private.humor_run_details (
  run_id uuid primary key references public.humor_runs(id) on delete cascade,
  attempt_token uuid,
  baseline_slot text check (baseline_slot in ('A','B')),
  stages jsonb not null default '[]',
  result jsonb
);
create table private.humor_config (
  singleton boolean primary key default true check (singleton),
  writer_key_sha256 text not null,
  daily_project_limit integer not null default 100 check (daily_project_limit between 1 and 1000)
);
create table public.humor_votes (
  run_id uuid not null references public.humor_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  choice text not null check (choice in ('A','B')),
  created_at timestamptz not null default now(),
  primary key(run_id,user_id)
);
create index humor_votes_user_idx on public.humor_votes(user_id);
alter table public.humor_images enable row level security;
alter table public.humor_runs enable row level security;
alter table public.humor_votes enable row level security;
alter table private.humor_run_details enable row level security;
alter table private.humor_config enable row level security;
revoke all on public.humor_images,public.humor_runs,public.humor_votes from anon,authenticated;
revoke all on private.humor_run_details,private.humor_config from public,anon,authenticated;
grant select on public.humor_images,public.humor_runs to anon,authenticated;
grant select on public.humor_votes to authenticated;
create policy "Read completed or own humor runs" on public.humor_runs for select to anon,authenticated
  using (status='ready' or owner_id=(select auth.uid()));
create policy "Read published or own humor images" on public.humor_images for select to anon,authenticated
  using (owner_id=(select auth.uid()) or exists(select 1 from public.humor_runs r where r.image_id=humor_images.id and r.status='ready'));
create policy "Read only own humor preference" on public.humor_votes for select to authenticated
  using (user_id=(select auth.uid()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('humor-images','humor-images',true,2097152,array['image/jpeg']);
create policy "Upload own humor image" on storage.objects for insert to authenticated
  with check (bucket_id='humor-images' and name ~ ('^'||(select auth.uid())::text||'/[0-9a-f-]{36}\.jpg$'));
create policy "Read own humor objects" on storage.objects for select to authenticated
  using (bucket_id='humor-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Clean up unattached humor images" on storage.objects for delete to authenticated
  using (bucket_id='humor-images' and (storage.foldername(name))[1]=(select auth.uid())::text
    and not exists(select 1 from public.humor_images i where i.storage_path=name));

create function private.check_humor_writer(p_key text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or p_key is null or not exists(select 1 from private.humor_config where writer_key_sha256=encode(extensions.digest(p_key,'sha256'),'hex')) then
    raise exception 'Generation is unavailable.' using errcode='42501';
  end if;
end $$;
revoke all on function private.check_humor_writer(text) from public,anon,authenticated;

create function private.humor_new_run(p_image uuid,p_request uuid,p_parent uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_id uuid; v_existing public.humor_runs;
begin
  if v_user is null then raise exception 'Sign in to generate.' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles where id=v_user and nullif(btrim(first_name),'') is not null and nullif(btrim(last_name),'') is not null) then
    raise exception 'Complete your profile first.' using errcode='42501'; end if;
  if not exists(select 1 from public.humor_images where id=p_image and owner_id=v_user) then raise exception 'Image not found.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('humor-create-'||v_user::text,0));
  select * into v_existing from public.humor_runs where owner_id=v_user and request_key=p_request;
  if found then
    if v_existing.image_id<>p_image then raise exception 'Request already used.'; end if;
    return v_existing.id;
  end if;
  if exists(select 1 from public.humor_runs where owner_id=v_user and created_at>now()-interval '30 seconds') then raise exception 'Wait 30 seconds before starting another comparison.'; end if;
  if (select count(*) from public.humor_runs where owner_id=v_user and created_at>now()-interval '24 hours')>=10 then raise exception 'You have reached 10 comparisons today. Come back tomorrow.'; end if;
  insert into public.humor_runs(image_id,owner_id,request_key,parent_id) values(p_image,v_user,p_request,p_parent) returning id into v_id;
  insert into private.humor_run_details(run_id) values(v_id);
  return v_id;
end $$;
-- Only other checked database functions may invoke this internal helper.
revoke all on function private.humor_new_run(uuid,uuid,uuid) from public,anon,authenticated;

create function private.humor_create_upload(p_path text,p_title text,p_alt text,p_request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_image uuid; v_run uuid; v_user uuid:=auth.uid();
begin
  if v_user is null or p_path !~ ('^'||v_user::text||'/[0-9a-f-]{36}\.jpg$') then raise exception 'Sign in to upload.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('humor-create-'||v_user::text,0));
  select id into v_run from public.humor_runs where owner_id=v_user and request_key=p_request;
  if found then return v_run; end if;
  if not exists(select 1 from storage.objects where bucket_id='humor-images' and name=p_path) then raise exception 'Uploaded image not found.'; end if;
  insert into public.humor_images(owner_id,title,alt_text,storage_path) values(v_user,p_title,p_alt,p_path) returning id into v_image;
  return private.humor_new_run(v_image,p_request);
end $$;
create function public.humor_create_upload(p_path text,p_title text,p_alt text,p_request uuid) returns uuid
language sql security invoker set search_path='' as $$ select private.humor_create_upload(p_path,p_title,p_alt,p_request) $$;

create function private.humor_retry(p_run uuid,p_request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.humor_runs;
begin
  select * into r from public.humor_runs where id=p_run and owner_id=auth.uid() for update;
  if not found then raise exception 'Run not found.' using errcode='42501'; end if;
  if r.status='generating' and r.deadline_at<now()-interval '15 seconds' then
    update public.humor_runs set status='failed',error_message='Generation was interrupted. Please retry.' where id=r.id;
  elsif r.status<>'failed' then raise exception 'This comparison is still running or already complete.';
  end if;
  return private.humor_new_run(r.image_id,p_request,r.id);
end $$;
create function public.humor_retry(p_run uuid,p_request uuid) returns uuid
language sql security invoker set search_path='' as $$ select private.humor_retry(p_run,p_request) $$;

create function private.humor_claim(p_run uuid,p_key text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_token uuid:=gen_random_uuid(); v_count integer;
begin
  perform private.check_humor_writer(p_key);
  perform pg_advisory_xact_lock(hashtextextended('humor-project-budget',0));
  select count(*) into v_count from public.humor_runs where deadline_at>now()-interval '24 hours';
  if v_count >= (select daily_project_limit from private.humor_config) then raise exception 'The demo has reached its daily generation limit. Please try tomorrow.'; end if;
  update public.humor_runs set status='generating',deadline_at=now()+interval '105 seconds'
    where id=p_run and owner_id=auth.uid() and status='pending';
  if not found then return null; end if;
  update private.humor_run_details set attempt_token=v_token where run_id=p_run;
  return v_token;
end $$;
create function public.humor_claim(p_run uuid,p_key text) returns uuid
language sql security invoker set search_path='' as $$ select private.humor_claim(p_run,p_key) $$;

create function private.humor_record_step(p_run uuid,p_token uuid,p_key text,p_step jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform private.check_humor_writer(p_key);
  update private.humor_run_details d set stages=d.stages||jsonb_build_array(p_step)
    from public.humor_runs r where r.id=p_run and d.run_id=r.id and r.owner_id=auth.uid() and r.status='generating'
    and d.attempt_token=p_token and r.deadline_at>now();
  if not found then raise exception 'Generation attempt expired.'; end if;
end $$;
create function public.humor_record_step(p_run uuid,p_token uuid,p_key text,p_step jsonb) returns void
language sql security invoker set search_path='' as $$ select private.humor_record_step(p_run,p_token,p_key,p_step) $$;

create function private.humor_finish(p_run uuid,p_token uuid,p_key text,p_result jsonb,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
declare v_a boolean:=random()<0.5; r public.humor_runs;
begin
  perform private.check_humor_writer(p_key);
  select * into r from public.humor_runs where id=p_run and owner_id=auth.uid() and status='generating' for update;
  if not found or not exists(select 1 from private.humor_run_details where run_id=p_run and attempt_token=p_token) then raise exception 'Generation attempt expired.'; end if;
  if p_error is not null then
    update public.humor_runs set status='failed',finished_at=now(),error_message=left(p_error,240) where id=p_run;
    return;
  end if;
  if r.deadline_at<now() then raise exception 'Generation attempt expired.'; end if;
  update private.humor_run_details set result=p_result,baseline_slot=case when v_a then 'A' else 'B' end where run_id=p_run;
  update public.humor_runs set status='ready',finished_at=now(),error_message=null,
    caption_a=case when v_a then p_result->>'baseline' else p_result->>'guided' end,
    caption_b=case when v_a then p_result->>'guided' else p_result->>'baseline' end where id=p_run;
end $$;
create function public.humor_finish(p_run uuid,p_token uuid,p_key text,p_result jsonb,p_error text default null) returns void
language sql security invoker set search_path='' as $$ select private.humor_finish(p_run,p_token,p_key,p_result,p_error) $$;

create function private.humor_poll(p_run uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_choice text; v_a integer; v_b integer;
begin
  if auth.uid() is null then raise exception 'Sign in to vote.' using errcode='42501'; end if;
  select choice into v_choice from public.humor_votes where run_id=p_run and user_id=auth.uid();
  if not found then raise exception 'Choose a caption to reveal the poll.' using errcode='42501'; end if;
  select count(*) filter(where choice='A'),count(*) filter(where choice='B') into v_a,v_b from public.humor_votes where run_id=p_run;
  return jsonb_build_object('choice',v_choice,'a',v_a,'b',v_b,'total',v_a+v_b);
end $$;
create function public.humor_poll(p_run uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.humor_poll(p_run) $$;
create function private.humor_vote(p_run uuid,p_choice text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to vote.' using errcode='42501'; end if;
  if p_choice is null or p_choice not in ('A','B') then raise exception 'Choose A or B.'; end if;
  if not exists(select 1 from public.humor_runs where id=p_run and status='ready') then raise exception 'This comparison is not ready.'; end if;
  insert into public.humor_votes(run_id,user_id,choice) values(p_run,auth.uid(),p_choice) on conflict(run_id,user_id) do nothing;
  return private.humor_poll(p_run);
end $$;
create function public.humor_vote(p_run uuid,p_choice text) returns jsonb
language sql security invoker set search_path='' as $$ select private.humor_vote(p_run,p_choice) $$;

-- Restrict every new API and its implementation, without touching existing functions.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.proname in ('humor_create_upload','humor_retry','humor_claim','humor_record_step','humor_finish','humor_poll','humor_vote') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
end $$;
grant usage on schema private to authenticated;

create function private.immutable_humor_pair() returns trigger language plpgsql set search_path='' as $$
begin
  if old.status='ready' and (new.caption_a,new.caption_b,new.image_id,new.status) is distinct from (old.caption_a,old.caption_b,old.image_id,old.status) then
    raise exception 'Published caption pairs are immutable.';
  end if;
  return new;
end $$;
revoke all on function private.immutable_humor_pair() from public,anon,authenticated;
create trigger immutable_humor_pair before update on public.humor_runs for each row execute function private.immutable_humor_pair();
