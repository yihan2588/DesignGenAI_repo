-- Editable configurations keep their identity and A/B selection on Save.
-- Names are unique across the entire library, including manually retired history.
-- Normalize case and whitespace in the index so concurrent requests cannot bypass it.
create unique index prompt_revisions_unique_name
on private.prompt_revisions (lower(btrim(regexp_replace(name,'\s+',' ','g'))));

-- Capture each run's generation inputs, without creating configuration revisions.
alter table private.experiment_run_configs add column first_snapshot jsonb, add column second_snapshot jsonb;
update private.experiment_run_configs c set first_snapshot=to_jsonb(f),second_snapshot=to_jsonb(s)
from private.prompt_revisions f,private.prompt_revisions s where f.id=c.first_id and s.id=c.second_id;
alter table private.experiment_run_configs alter column first_snapshot set not null,alter column second_snapshot set not null;

create or replace function private.admin_mutate(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; a uuid; b uuid; path text;
begin
 perform private.require_superadmin();
 if p_action='save_prompt' then
  if coalesce(p_data->>'engine','direct') <> 'direct' then raise exception 'Caption approaches are now editable prompt instructions.'; end if;
  -- Serialize saves with activation, retirement and generation claims.
  perform 1 from private.active_experiment where singleton for update;
  v_id:=nullif(p_data->>'id','')::uuid;
  begin
   if v_id is null then
    insert into private.prompt_revisions(name,prompt,system_prompt,model,temperature,engine,parent_id)
    values(btrim(regexp_replace(p_data->>'name','\s+',' ','g')),p_data->>'prompt',coalesce(p_data->>'system_prompt',''),p_data->>'model',(p_data->>'temperature')::numeric,'direct',nullif(p_data->>'parent_id','')::uuid) returning id into v_id;
   else
    if exists(select 1 from private.prompt_revisions where id=v_id and archived) then
     raise exception 'Retired configurations cannot be edited. Reuse with a new name instead.';
    end if;
    update private.prompt_revisions set
     name=btrim(regexp_replace(p_data->>'name','\s+',' ','g')),
     prompt=p_data->>'prompt',system_prompt=coalesce(p_data->>'system_prompt',''),
     model=p_data->>'model',temperature=(p_data->>'temperature')::numeric,engine='direct'
    where id=v_id and not archived;
    if not found then raise exception 'Configuration not found. Refresh and try again.'; end if;
   end if;
  exception when unique_violation then
   raise exception 'A configuration with this name already exists. Choose a different name (including retired configurations).' using errcode='23505';
  end;
 elsif p_action='activate' then
  a:=(p_data->>'first_id')::uuid; b:=(p_data->>'second_id')::uuid;
  -- Serialize activation with archive; no active revision can disappear between checks.
  perform 1 from private.active_experiment where singleton for update;
  if a=b or (select count(*) from private.prompt_revisions where id in(a,b) and not archived)<>2 then raise exception 'Choose two different available configurations.'; end if;
  update private.active_experiment set first_id=a,second_id=b,updated_at=now() where singleton=true;
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

create or replace function private.humor_experiment_claim(p_run uuid,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare token uuid; a private.active_experiment; f jsonb; s jsonb;
begin
 token:=private.humor_claim(p_run,p_key);
 if token is null then return null; end if;
 -- A Save cannot interleave the snapshot and the inputs returned to generation.
 select * into a from private.active_experiment where singleton for share;
 select to_jsonb(p) into f from private.prompt_revisions p where id=a.first_id;
 select to_jsonb(p) into s from private.prompt_revisions p where id=a.second_id;
 insert into private.experiment_run_configs(run_id,first_id,second_id,first_snapshot,second_snapshot)
 values(p_run,a.first_id,a.second_id,f,s);
 return jsonb_build_object('token',token,'first',f,'second',s);
end $$;

create or replace function private.humor_poll(p_run uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_choice text; v_a integer; v_b integer; slot text; labels jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to vote.' using errcode='42501'; end if;
 select choice into v_choice from public.humor_votes where run_id=p_run and user_id=auth.uid();
 if not found then raise exception 'Choose a caption to reveal the poll.' using errcode='42501'; end if;
 select baseline_slot into slot from private.humor_run_details where run_id=p_run;
 select jsonb_build_object(
  'A',case when slot='A' then c.first_snapshot->>'name' else c.second_snapshot->>'name' end,
  'B',case when slot='B' then c.first_snapshot->>'name' else c.second_snapshot->>'name' end)
 into labels from private.experiment_run_configs c where c.run_id=p_run;
 select count(*) filter(where choice='A'),count(*) filter(where choice='B') into v_a,v_b from public.humor_votes where run_id=p_run;
 return jsonb_build_object('choice',v_choice,'a',v_a,'b',v_b,'total',v_a+v_b,'baseline_slot',slot,'labels',labels);
end $$;
-- CREATE OR REPLACE preserves existing restricted grants and checked wrappers.
