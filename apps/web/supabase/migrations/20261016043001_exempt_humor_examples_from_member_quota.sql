-- Only administrators can mark examples. Keep seeded examples out of member quotas.
-- The 30-second cooldown and project-wide generation limit still include every run.
create or replace function private.humor_new_run(p_image uuid,p_request uuid,p_parent uuid default null) returns uuid
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
  if (select count(*) from public.humor_runs where owner_id=v_user and not is_example and created_at>now()-interval '24 hours')>=10 then raise exception 'You have reached 10 comparisons today. Come back tomorrow.'; end if;
  insert into public.humor_runs(image_id,owner_id,request_key,parent_id) values(p_image,v_user,p_request,p_parent) returning id into v_id;
  insert into private.humor_run_details(run_id) values(v_id);
  return v_id;
end $$;
-- Only other checked database functions may invoke this internal helper.
revoke all on function private.humor_new_run(uuid,uuid,uuid) from public,anon,authenticated;

