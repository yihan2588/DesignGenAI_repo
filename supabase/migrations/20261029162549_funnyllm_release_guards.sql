-- Complete report pagination and bind model activation to its verified identifier.
create or replace function private.funny_admin_snapshot(p_area text default 'overview',p_page integer default 1,p_query text default '',p_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb;data jsonb;reports jsonb;off integer:=(greatest(1,least(coalesce(p_page,1),10000))-1)*24;
begin
 perform private.require_superadmin();
 if length(coalesce(p_query,''))>160 then raise exception 'Search is too long.';end if;
 if p_area='overview' then
  return jsonb_build_object('enabled',(select enabled from private.cowriter_settings where singleton),
  'catalog',(select jsonb_build_object('total',count(*),'available',count(*)filter(where available),'embedded',count(*)filter(where embedding is not null))from public.cowriter_catalog),
  'summary',(select jsonb_build_object('requests',count(*),'completed',count(*)filter(where status='ready'),'failed',count(*)filter(where status='failed'),
   'posts',(select count(*) from private.funny_posts where status='published'),'reports',(select count(*) from private.funny_reports where status='open'),
   'users',(select count(*) from public.profiles),'p95_ms',percentile_cont(.95)within group(order by (metrics->>'elapsed_ms')::numeric)filter(where status='ready' and action='draft')) from private.cowriter_requests where created_at>now()-interval '7 days'),
  'activity',(select coalesce(jsonb_agg(t),'[]')from(select id,action,status,created_at,metrics->'elapsed_ms' elapsed_ms from private.cowriter_requests order by created_at desc limit 10)t),
  'feedback',(select coalesce(jsonb_agg(t),'[]')from(select reason,count(*) total from private.cowriter_feedback group by reason)t));
 elsif p_area='content' then
  select coalesce(jsonb_agg(t),'[]') into rows from(select p.id,p.caption,p.alt,p.width,p.height,p.author_name,p.featured,p.status,p.created_at,p.owner_id=auth.uid() owned,
   p.session_id,p.option_id,p.revision,p.removed_reason,(select count(*) from private.funny_reactions r where r.post_id=p.id and r.kind='like')like_count,false liked,false saved
   from private.funny_posts p where (p_id is null or p.id=p_id) and (coalesce(p_query,'')='' or p.caption ilike '%'||p_query||'%' or p.author_name ilike '%'||p_query||'%') order by p.created_at desc limit 25 offset off)t;
  select coalesce(jsonb_agg(t),'[]') into reports from(select id,post_id,reason,status,created_at from private.funny_reports order by (status='open')desc,created_at desc,id limit 25 offset off)t;
  return jsonb_build_object('posts',case when jsonb_array_length(rows)>24 then rows-24 else rows end,'more',jsonb_array_length(rows)>24,
   'reports',case when jsonb_array_length(reports)>24 then reports-24 else reports end,'reports_more',jsonb_array_length(reports)>24);
 elsif p_area='library' then
  select coalesce(jsonb_agg(t),'[]') into rows from(select id,description,affordances,storage_path,width,height,available,embedding is not null indexed,description_origin,family,updated_at
   from public.cowriter_catalog where (p_id is null or id=p_id) and (coalesce(p_query,'')='' or description ilike '%'||p_query||'%' or affordances ilike '%'||p_query||'%') order by updated_at desc,id limit 25 offset off)t;
  return jsonb_build_object('images',case when jsonb_array_length(rows)>24 then rows-24 else rows end,'more',jsonb_array_length(rows)>24);
 elsif p_area='activity' then
  if p_id is not null then
   select to_jsonb(t) into data from(select r.id,r.owner_id,r.session_id,r.action,r.status,r.error,r.metrics,r.created_at,r.finished_at,s.state->'input'->>'mode' mode,s.state->'input' input,r.result
    from private.cowriter_requests r join private.cowriter_sessions s on s.id=r.session_id where r.id=p_id order by r.created_at desc limit 1)t;
   return jsonb_build_object('request',data);
  end if;
  select coalesce(jsonb_agg(t),'[]') into rows from(select r.id,r.owner_id,r.session_id,r.action,r.status,r.error,
    (r.metrics-'timings')||jsonb_build_object('timings',(select coalesce(jsonb_agg(jsonb_build_object('stage',j->'stage','elapsed_ms',j->'elapsed_ms','usage',j->'usage','outcome',j->'outcome')),'[]') from jsonb_array_elements(coalesce(r.metrics->'timings','[]'))j)) metrics,
    r.created_at,r.finished_at,s.state->'input'->>'mode' mode
   from private.cowriter_requests r join private.cowriter_sessions s on s.id=r.session_id
   where coalesce(p_query,'')='' or r.action ilike '%'||p_query||'%' or r.status ilike '%'||p_query||'%' or r.id::text ilike '%'||p_query||'%' or r.session_id::text ilike '%'||p_query||'%'
   order by r.created_at desc limit 25 offset off)t;
  return jsonb_build_object('requests',case when jsonb_array_length(rows)>24 then rows-24 else rows end,'more',jsonb_array_length(rows)>24);
 elsif p_area='examples' then
  return jsonb_build_object('examples',(select coalesce(jsonb_agg(t),'[]')from(select id,intent,image_description,caption,enabled,created_at from private.funny_examples where not retired order by created_at desc)t));
 elsif p_area='configuration' then
  return jsonb_build_object('enabled',(select enabled from private.cowriter_settings where singleton),
   'models',(select coalesce(jsonb_agg(t),'[]')from(select id,label,model_id,enabled,selected from private.funny_models where not retired order by selected desc,label)t),
   'provider',jsonb_build_object('name','Google Gemini','adapter','gemini-interactions'),
   'workflow',jsonb_build_object('version','cowriter-2','steps',jsonb_build_array('Interpret','Retrieve images (thought mode)','Compose','Validate and save'),'max_words',20));
 elsif p_area='people' then
  select coalesce(jsonb_agg(t),'[]') into rows from(select u.id,u.email,p.first_name,p.last_name,u.created_at,
   exists(select 1 from private.funny_admin_allowlist a where a.email=lower(u.email)) is_admin
   from auth.users u left join public.profiles p on p.id=u.id where coalesce(p_query,'')='' or u.email ilike '%'||p_query||'%' or p.first_name ilike '%'||p_query||'%' or p.last_name ilike '%'||p_query||'%'
   order by u.created_at desc limit 25 offset off)t;
  return jsonb_build_object('users',case when jsonb_array_length(rows)>24 then rows-24 else rows end,'more',jsonb_array_length(rows)>24,'admins',(select jsonb_agg(a)from(select email from private.funny_admin_allowlist order by email)a));
 end if;
 raise exception 'Unknown admin area.';
end $$;
create or replace function private.funny_admin_mutate(p_action text,p_id uuid default null,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare v uuid:=p_id;i public.cowriter_catalog;model private.funny_models;
begin
 perform private.require_superadmin();
 if p_data is null or jsonb_typeof(p_data)<>'object' or pg_column_size(p_data)>60000 then raise exception 'Invalid admin input.';end if;
 if p_action='writing_enabled' then
  if jsonb_typeof(p_data->'enabled') is distinct from 'boolean' then raise exception 'Choose a writing state.';end if;
  update private.cowriter_settings set enabled=(p_data->>'enabled')::boolean where singleton;
 elsif p_action in('post_feature','post_remove','post_restore') then
  perform 1 from private.funny_posts where id=p_id for update;if not found then raise exception 'Publication not found.';end if;
  if p_action='post_feature' then
   if jsonb_typeof(p_data->'featured') is distinct from 'boolean' then raise exception 'Choose a feature state.';end if;
   update private.funny_posts set featured=(p_data->>'featured')::boolean,updated_at=now() where id=p_id;
  elsif p_action='post_remove' then
   if length(btrim(coalesce(p_data->>'reason','')))<3 then raise exception 'Add a removal reason.';end if;
   update private.funny_posts set status='removed',featured=false,removed_reason=left(p_data->>'reason',500),updated_at=now() where id=p_id;
   update private.funny_reports set status='resolved' where post_id=p_id;
  else
   -- Restoration returns to the owner's private publications; only the owner republishes.
   update private.funny_posts set status=case when owner_id is null then 'published' else 'unpublished' end,removed_reason=null,updated_at=now() where id=p_id and status='removed';
  end if;
 elsif p_action='report_resolve' then
  update private.funny_reports set status='resolved' where id=p_id;if not found then raise exception 'Report not found.';end if;
 elsif p_action='example_save' then
  perform pg_advisory_xact_lock(8120043);
  if coalesce((p_data->>'enabled')::boolean,false) and (select count(*)from private.funny_examples where enabled and not retired and (p_id is null or id<>p_id))>=3 then raise exception 'Use at most three active writing examples. Disable another first.';end if;
  if v is null then v:=gen_random_uuid();else perform 1 from private.funny_examples where id=v and not retired;if not found then raise exception 'Example not found.';end if;end if;
  insert into private.funny_examples(id,intent,image_description,caption,enabled) values(v,btrim(p_data->>'intent'),btrim(p_data->>'image_description'),btrim(p_data->>'caption'),coalesce((p_data->>'enabled')::boolean,false))
   on conflict(id)do update set intent=excluded.intent,image_description=excluded.image_description,caption=excluded.caption,enabled=excluded.enabled,updated_at=now();
 elsif p_action='example_delete' then
  update private.funny_examples set retired=true,enabled=false,updated_at=now() where id=p_id;if not found then raise exception 'Example not found.';end if;
 elsif p_action in('model_save','model_delete','model_activate') then
  perform pg_advisory_xact_lock(8120044);
  select * into model from private.funny_models where id=p_id and not retired for update;
  if p_action<>'model_save' and not found then raise exception 'Model not found.';end if;
  if p_action='model_activate' then
   if p_data->>'expected_model_id' is null or p_data->>'expected_model_id' is distinct from model.model_id then raise exception 'Model settings changed. Run the connection check again.' using errcode='40001';end if;
   if not model.enabled then raise exception 'Enable this model first.';end if;
   update private.funny_models set selected=false where selected;
   update private.funny_models set selected=true,updated_at=now() where id=p_id;
  elsif p_action='model_delete' then
   if model.selected then raise exception 'Select another model before retiring this one.';end if;
   update private.funny_models set retired=true,enabled=false,updated_at=now() where id=p_id;
  else
   if model.selected and (coalesce((p_data->>'enabled')::boolean,false)=false or p_data->>'model_id' is distinct from model.model_id) then raise exception 'Keep the active model enabled and its identifier unchanged.';end if;
   if p_id is not null and model.id is null then raise exception 'Model not found.';end if;
   if v is null then v:=gen_random_uuid();end if;
   insert into private.funny_models(id,label,model_id,enabled)values(v,btrim(p_data->>'label'),btrim(p_data->>'model_id'),coalesce((p_data->>'enabled')::boolean,false))
    on conflict(id)do update set label=excluded.label,model_id=excluded.model_id,enabled=excluded.enabled,updated_at=now();
  end if;
 elsif p_action='library_save' then
  if v is null then v:=gen_random_uuid();end if;
  perform pg_advisory_xact_lock(hashtextextended(v::text,49));
  select * into i from public.cowriter_catalog where id=v for update;
  if i.storage_path is not null and p_data->>'storage_path' is distinct from i.storage_path then raise exception 'An existing image cannot be replaced. Upload a new library image.';end if;
  if length(btrim(coalesce(p_data->>'description',''))) not between 3 and 4000 or length(coalesce(p_data->>'affordances',''))>2000 then raise exception 'Add a description of 3–4000 characters.';end if;
  if jsonb_typeof(p_data->'embedding') is distinct from 'array' or jsonb_array_length(p_data->'embedding')<>768 then raise exception 'Index this image before saving.';end if;
  if p_data->>'index_version' is distinct from 'teaching-1-gemini-001-768' then raise exception 'Incompatible embedding version.';end if;
  if p_data->>'storage_path' is null or p_data->>'storage_path' !~ '^([a-f0-9]{64}\.jpg|managed/[a-f0-9-]{36}\.jpg)$' then raise exception 'Invalid image path.';end if;
  if p_data->>'storage_path' like 'managed/%' and not exists(select 1 from storage.objects where bucket_id='funny-library' and name=p_data->>'storage_path') then raise exception 'Upload the image before saving it.';end if;
  if (p_data->>'width')::int not between 1 and 12000 or (p_data->>'height')::int not between 1 and 12000 then raise exception 'Invalid image size.';end if;
  insert into public.cowriter_catalog(id,source_url,source_hash,description,description_origin,affordances,family,storage_path,width,height,available,embedding,index_version)
  values(v,coalesce(i.source_url,'managed:'||(p_data->>'storage_path')),coalesce(i.source_hash,p_data->>'family'),btrim(p_data->>'description'),coalesce(i.description_origin,'backfill'),coalesce(p_data->>'affordances',''),coalesce(i.family,p_data->>'family'),p_data->>'storage_path',(p_data->>'width')::int,(p_data->>'height')::int,coalesce((p_data->>'available')::boolean,true),(p_data->'embedding')::text::extensions.vector(768),p_data->>'index_version')
  on conflict(id)do update set description=excluded.description,affordances=excluded.affordances,available=excluded.available,embedding=excluded.embedding,index_version=excluded.index_version,updated_at=now();
 elsif p_action='library_delete' then
  update public.cowriter_catalog set available=false,updated_at=now() where id=p_id;if not found then raise exception 'Image not found.';end if;
 else raise exception 'Unknown admin action.';end if;
 insert into private.admin_audit(actor,action,target)values(auth.uid(),'funny:'||p_action,v::text);
 return jsonb_build_object('ok',true,'id',v);
end $$;

-- All historical records remain. New comparison activity is retired at the database boundary.
do $$declare f record;t text;c record;begin
 for f in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and p.proname in('humor_vote','humor_create_upload','humor_retry','humor_experiment_claim','humor_claim','humor_record_step','humor_finish','admin_mutate') loop
 execute format('revoke all on function %I.%I(%s) from public,anon,authenticated',f.nspname,f.proname,f.args);
 end loop;
 foreach t in array array['food_photos','food_captions','caption_votes','caption_generation_requests','humor_images','humor_runs','humor_votes'] loop
 if to_regclass('public.'||t) is not null then
 execute format('revoke insert,update,delete on public.%I from anon,authenticated',t);
 for c in select column_name from information_schema.columns where table_schema='public' and table_name=t loop
 execute format('revoke insert(%I),update(%I) on public.%I from anon,authenticated',c.column_name,c.column_name,t);
 end loop;end if;end loop;
 for c in select policyname from pg_policies where schemaname='storage' and tablename='objects' and cmd in('INSERT','UPDATE') and (with_check like '%humor-images%' or with_check like '%food-photos%') loop
 execute format('drop policy %I on storage.objects',c.policyname);
 end loop;
end $$;
