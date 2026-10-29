-- PostgREST enables safeupdate; even singleton updates require an explicit predicate.
create or replace function private.admin_mutate(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
