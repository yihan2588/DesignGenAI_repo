-- Gallery-first FunnyLLM. Additive content domain; legacy records remain readable.
create table private.funny_admin_allowlist(email text primary key check(email=lower(email)));
insert into private.funny_admin_allowlist values ('yihan2588@gmail.com'),('yw4756@columbia.edu'),('hg2736@columbia.edu');
alter table private.funny_admin_allowlist enable row level security;
create function private.is_funny_admin() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and auth.jwt()->'app_metadata'->>'provider'='google' and exists(
 select 1 from auth.users u join private.funny_admin_allowlist a on lower(u.email)=a.email
 where u.id=auth.uid() and u.email_confirmed_at is not null)
$$;
create or replace function private.require_superadmin() returns void language plpgsql security definer set search_path='' as $$
begin if not coalesce(private.is_funny_admin(),false) then raise exception 'This Google account does not have admin access.' using errcode='42501'; end if; end $$;

create table private.funny_posts(
 id uuid primary key default gen_random_uuid(),owner_id uuid references auth.users(id) on delete set null,
 session_id uuid references private.cowriter_sessions(id) on delete set null,revision integer,option_id uuid,
 caption text not null check(length(btrim(caption)) between 1 and 200 and cardinality(regexp_split_to_array(btrim(caption),'\s+'))<=20),
 alt text not null check(length(alt)<=1000),width integer not null check(width between 1 and 12000),height integer not null check(height between 1 and 12000),
 bucket text not null check(bucket in('funny-gallery','catalog')),image_path text not null,
 author_name text not null check(length(btrim(author_name)) between 1 and 40),
 status text not null default 'published' check(status in('published','unpublished','removed')),
 featured boolean not null default false,removed_reason text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(session_id,revision,option_id)
);
create index funny_posts_feed on private.funny_posts(status,created_at desc);
create index funny_posts_owner on private.funny_posts(owner_id,created_at desc);
create index funny_posts_image on private.funny_posts(image_path);
create table private.funny_reactions(
 post_id uuid not null references private.funny_posts(id) on delete cascade,owner_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in('like','save')),created_at timestamptz not null default now(),primary key(post_id,owner_id,kind)
);
create index funny_reactions_owner on private.funny_reactions(owner_id,kind);
create table private.funny_reports(
 id uuid primary key default gen_random_uuid(),post_id uuid not null references private.funny_posts(id),owner_id uuid not null references auth.users(id),
 reason text not null check(length(btrim(reason)) between 5 and 500),status text not null default 'open' check(status in('open','resolved')),
 created_at timestamptz not null default now(),unique(post_id,owner_id)
);
create index funny_reports_status on private.funny_reports(status,created_at desc);
create table private.funny_models(
 id uuid primary key default gen_random_uuid(),label text not null check(length(btrim(label)) between 1 and 80),
 model_id text not null unique check(model_id ~ '^gemini-[a-z0-9][a-z0-9.-]{1,100}$'),
 enabled boolean not null default true,selected boolean not null default false,retired boolean not null default false,
 updated_at timestamptz not null default now(),check(not selected or (enabled and not retired))
);
create unique index funny_one_selected_model on private.funny_models(selected) where selected;
insert into private.funny_models(label,model_id,selected) values('Gemini 3.1 Flash-Lite','gemini-3.1-flash-lite',true);
create table private.funny_examples(
 id uuid primary key default gen_random_uuid(),intent text not null check(length(btrim(intent)) between 3 and 500),
 image_description text not null check(length(btrim(image_description)) between 3 and 1000),
 caption text not null check(length(btrim(caption)) between 1 and 200 and cardinality(regexp_split_to_array(btrim(caption),'\s+'))<=20),
 enabled boolean not null default false,retired boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
-- Private tables deliberately have no direct Data API grants or RLS policies.
do $$declare t text;begin foreach t in array array['funny_posts','funny_reactions','funny_reports','funny_models','funny_examples'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated',t);
end loop;end $$;
revoke all on private.funny_admin_allowlist from public,anon,authenticated;

create function private.funny_feed(p_filter text default 'latest',p_page integer default 1,p_query text default '',p_post uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb; off integer:= (greatest(1,least(coalesce(p_page,1),10000))-1)*24;u uuid:=auth.uid();
begin
 if p_filter not in('latest','featured','mine','saved') or length(coalesce(p_query,''))>160 then raise exception 'Invalid gallery filter.';end if;
 if p_filter in('mine','saved') and u is null then raise exception 'Sign in to see your collection.' using errcode='42501';end if;
 select coalesce(jsonb_agg(t),'[]') into rows from (
 select p.id,p.caption,p.alt,p.width,p.height,p.author_name,p.featured,p.status,p.created_at,p.owner_id=u as owned,
 (select count(*) from private.funny_reactions r where r.post_id=p.id and r.kind='like') as like_count,
 exists(select 1 from private.funny_reactions r where r.post_id=p.id and r.owner_id=u and r.kind='like') liked,
 exists(select 1 from private.funny_reactions r where r.post_id=p.id and r.owner_id=u and r.kind='save') saved
 from private.funny_posts p where (p.status='published' or (p_filter='mine' and p.owner_id=u))
 and (p_post is null or p.id=p_post)
 and (p_filter<>'featured' or p.featured) and (p_filter<>'mine' or p.owner_id=u)
 and (p_filter<>'saved' or exists(select 1 from private.funny_reactions r where r.post_id=p.id and r.owner_id=u and r.kind='save'))
 and (coalesce(p_query,'')='' or p.caption ilike '%'||p_query||'%' or p.author_name ilike '%'||p_query||'%')
 order by p.created_at desc,p.id limit 25 offset off)t;
 return jsonb_build_object('posts',case when jsonb_array_length(rows)>24 then rows-24 else rows end,'more',jsonb_array_length(rows)>24);
end $$;
create function public.funny_feed(p_filter text default 'latest',p_page integer default 1,p_query text default '',p_post uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.funny_feed(p_filter,p_page,p_query,p_post)$$;

create function private.funny_image(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p private.funny_posts;
begin
 select * into p from private.funny_posts where id=p_id and (status='published' or owner_id=auth.uid() or private.is_funny_admin());
 if not found then raise exception 'Meme not found.' using errcode='42501';end if;
 return jsonb_build_object('bucket',p.bucket,'path',p.image_path,'caption',p.caption,'alt',p.alt,'width',p.width,'height',p.height);
end $$;
create function public.funny_image(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.funny_image(p_id)$$;

create function private.funny_publish(p_key text,p_session uuid,p_revision integer,p_option uuid,p_path text,p_author text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.cowriter_sessions;o jsonb;p private.funny_posts;u uuid:=auth.uid();
begin
 perform private.check_humor_writer(p_key);
 perform pg_advisory_xact_lock(hashtextextended(u::text,47));
 select * into s from private.cowriter_sessions where id=p_session and owner_id=u for update;
 if not found or s.revision<>p_revision then raise exception 'Your draft changed. Reload before sharing.' using errcode='40001';end if;
 select value into o from jsonb_array_elements(s.state->'options') where value->>'id'=p_option::text;
 if o is null then raise exception 'Take not found.';end if;
 select * into p from private.funny_posts where session_id=p_session and revision=p_revision and option_id=p_option;
 if found then return jsonb_build_object('postId',p.id,'status',p.status);end if;
 if (select count(*) from private.funny_posts where owner_id=u and created_at>now()-interval '24 hours')>=20 then raise exception 'You can share up to 20 memes per day.' using errcode='54000';end if;
 if p_path is null or p_path !~ ('^'||u::text||'/[a-f0-9-]{36}\.jpg$') or not exists(select 1 from storage.objects where bucket_id='funny-gallery' and name=p_path) then raise exception 'The public image could not be prepared.';end if;
 if p_author is null or length(btrim(p_author)) not between 1 and 40 then raise exception 'Choose a public name of 1–40 characters.';end if;
 insert into private.funny_posts(owner_id,session_id,revision,option_id,caption,alt,width,height,bucket,image_path,author_name)
 values(u,s.id,s.revision,p_option,o->>'caption',left(coalesce(o->>'alt','A meme'),1000),(o->>'width')::int,(o->>'height')::int,'funny-gallery',p_path,btrim(p_author)) returning * into p;
 return jsonb_build_object('postId',p.id,'status',p.status);
end $$;
create function public.funny_publish(p_key text,p_session uuid,p_revision integer,p_option uuid,p_path text,p_author text) returns jsonb language sql security invoker set search_path='' as $$select private.funny_publish(p_key,p_session,p_revision,p_option,p_path,p_author)$$;
create function private.funny_gallery_action(p_id uuid,p_action text,p_value boolean default null,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.funny_posts;u uuid:=auth.uid();
begin
 if u is null then raise exception 'Sign in first.' using errcode='42501';end if;
 select * into p from private.funny_posts where id=p_id for update;
 if not found then raise exception 'Meme not found.';end if;
 if p_action in('unpublish','republish') then
  if p.owner_id is distinct from u then raise exception 'This is not your publication.' using errcode='42501';end if;
  if p.status='removed' then raise exception 'An admin removed this meme. It cannot be republished.' using errcode='42501';end if;
  update private.funny_posts set status=case when p_action='unpublish' then 'unpublished' else 'published' end,updated_at=now() where id=p_id;
 elsif p_action in('like','save') then
  if p.status<>'published' then raise exception 'This meme is no longer public.';end if;
  if p_value is null then raise exception 'Choose whether to keep this reaction.';end if;
  if p_value then insert into private.funny_reactions(post_id,owner_id,kind) values(p_id,u,p_action) on conflict do nothing;
  else delete from private.funny_reactions where post_id=p_id and owner_id=u and kind=p_action;end if;
 elsif p_action='report' then
  if p.status<>'published' then raise exception 'This meme is no longer public.';end if;
  if p_reason is null or length(btrim(p_reason)) not between 5 and 500 then raise exception 'Tell us the issue in 5–500 characters.';end if;
  if (select count(*) from private.funny_reports where owner_id=u and created_at>now()-interval '24 hours')>=20 then raise exception 'The daily reporting limit has been reached.' using errcode='54000';end if;
  insert into private.funny_reports(post_id,owner_id,reason) values(p_id,u,btrim(p_reason)) on conflict(post_id,owner_id) do update set reason=excluded.reason,status='open';
 else raise exception 'Unknown gallery action.';end if;
 return jsonb_build_object('ok',true);
end $$;
create function public.funny_gallery_action(p_id uuid,p_action text,p_value boolean default null,p_reason text default null) returns jsonb language sql security invoker set search_path='' as $$select private.funny_gallery_action(p_id,p_action,p_value,p_reason)$$;

create function private.funny_runtime() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m private.funny_models;examples jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501';end if;
 select * into m from private.funny_models where selected and enabled and not retired;
 if not found then raise exception 'No generation model is enabled.';end if;
 select coalesce(jsonb_agg(t),'[]') into examples from(select id,intent,image_description,caption from private.funny_examples where enabled and not retired order by updated_at desc,id limit 3)t;
 return jsonb_build_object('model',m.model_id,'examples',examples,'config_version','cowriter-2:'||md5(m.model_id||examples::text));
end $$;
create function public.funny_runtime() returns jsonb language sql security invoker set search_path='' as $$select private.funny_runtime()$$;
create function private.funny_remix(p_key text,p_post uuid,p_upload_path text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.funny_posts;s private.cowriter_sessions;v jsonb;u uuid:=auth.uid();
begin
 perform private.check_humor_writer(p_key);
 select * into p from private.funny_posts where id=p_post and status='published';
 if not found then raise exception 'This meme is no longer available.';end if;
 if p_upload_path is null or p_upload_path !~ ('^'||u::text||'/[a-f0-9-]{36}\.jpg$') or not exists(select 1 from storage.objects where bucket_id='cowriter-uploads' and name=p_upload_path) then raise exception 'Remix image unavailable.';end if;
 if (select count(*) from private.cowriter_sessions where owner_id=u and created_at>now()-interval '24 hours')>=100 then raise exception 'The daily draft limit has been reached.' using errcode='54000';end if;
 v=jsonb_build_object('input',jsonb_build_object('mode','pic','text','','locks','','uploadPath',p_upload_path),'source_post',p.id,'runtime',private.funny_runtime(),
 'intent',jsonb_build_object('target','A new take','spirit','A new take on this picture','explicit_constraints','[]'::jsonb,'visual_anchors',jsonb_build_array(p.alt),'angles',jsonb_build_array('Original take','A different turn'),'search_queries',jsonb_build_object('topic','','relationship','','visual_analogy','')),
 'pool','[]'::jsonb,'options',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'image_id','upload','caption',p.caption,'alt',p.alt,'width',p.width,'height',p.height,'angle','Original take','intent_bridge','A remix of a shared meme','preserve_on_edit','The selected comic premise')));
 insert into private.cowriter_sessions(owner_id,state,revision) values(u,v,1) returning * into s;
 v=v||jsonb_build_object('id',s.id,'revision',1);
 update private.cowriter_sessions set state=v where id=s.id;return v;
end $$;
create function public.funny_remix(p_key text,p_post uuid,p_upload_path text) returns jsonb language sql security invoker set search_path='' as $$select private.funny_remix(p_key,p_post,p_upload_path)$$;

-- Historical saved drafts retain read access to retired assets. New retrieval excludes them.
create function private.funny_catalog_image(p_id uuid,p_session uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare i public.cowriter_catalog;
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501';end if;
 select * into i from public.cowriter_catalog where id=p_id;
 if not found or not(i.available or private.is_funny_admin() or exists(select 1 from private.cowriter_sessions s where s.id=p_session and s.owner_id=auth.uid() and exists(select 1 from jsonb_array_elements(s.state->'pool') x where x->>'id'=p_id::text and x->>'storage_path'=i.storage_path))) then raise exception 'Image not found.' using errcode='42501';end if;
 return jsonb_build_object('storage_path',i.storage_path,'available',i.available,'width',i.width,'height',i.height);
end $$;
create function public.funny_catalog_image(p_id uuid,p_session uuid) returns jsonb language sql security invoker set search_path='' as $$select private.funny_catalog_image(p_id,p_session)$$;

create function private.funny_admin_snapshot(p_area text default 'overview',p_page integer default 1,p_query text default '',p_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb;data jsonb;off integer:=(greatest(1,least(coalesce(p_page,1),10000))-1)*24;
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
  return jsonb_build_object('posts',case when jsonb_array_length(rows)>24 then rows-24 else rows end,'more',jsonb_array_length(rows)>24,
   'reports',(select coalesce(jsonb_agg(t),'[]')from(select id,post_id,reason,status,created_at from private.funny_reports order by (status='open')desc,created_at desc limit 50)t));
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
create function public.funny_admin_snapshot(p_area text default 'overview',p_page integer default 1,p_query text default '',p_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.funny_admin_snapshot(p_area,p_page,p_query,p_id)$$;

create function private.funny_admin_mutate(p_action text,p_id uuid default null,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
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
create function public.funny_admin_mutate(p_action text,p_id uuid default null,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.funny_admin_mutate(p_action,p_id,p_data)$$;

-- Publication files are private objects. Every read is conditional on the current post status.
create function private.funny_gallery_read(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.funny_posts where bucket='funny-gallery' and image_path=p_path and (status='published' or owner_id=auth.uid() or private.is_funny_admin()))
$$;
create function private.funny_gallery_write(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and p_path ~ ('^'||auth.uid()::text||'/[a-f0-9-]{36}\.jpg$') and (select count(*) from storage.objects where bucket_id='funny-gallery' and name like auth.uid()::text||'/%')<200
$$;
create function private.funny_gallery_cleanup(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and split_part(p_path,'/',1)=auth.uid()::text and not exists(select 1 from private.funny_posts where bucket='funny-gallery' and image_path=p_path)
$$;
create function private.funny_library_read(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (private.is_funny_admin() or exists(select 1 from public.cowriter_catalog where storage_path=p_path and available)
 or exists(select 1 from private.cowriter_sessions s where owner_id=auth.uid() and exists(select 1 from jsonb_array_elements(s.state->'pool') x where x->>'storage_path'=p_path)))
$$;
create function private.funny_library_cleanup(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_funny_admin() and not exists(select 1 from public.cowriter_catalog where storage_path=p_path)
$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)values
 ('funny-gallery','funny-gallery',false,2097152,array['image/jpeg']),('funny-library','funny-library',false,2097152,array['image/jpeg']);
create policy funny_gallery_insert on storage.objects for insert to authenticated with check(bucket_id='funny-gallery' and private.funny_gallery_write(name));
create policy funny_gallery_read on storage.objects for select to anon,authenticated using(bucket_id='funny-gallery' and private.funny_gallery_read(name));
create policy funny_gallery_cleanup on storage.objects for delete to authenticated using(bucket_id='funny-gallery' and private.funny_gallery_cleanup(name));
create policy funny_library_insert on storage.objects for insert to authenticated with check(bucket_id='funny-library' and name ~ '^managed/[a-f0-9-]{36}\.jpg$' and private.is_funny_admin());
create policy funny_library_read on storage.objects for select to authenticated using(bucket_id='funny-library' and private.funny_library_read(name));
create policy funny_library_cleanup on storage.objects for delete to authenticated using(bucket_id='funny-library' and private.funny_library_cleanup(name));
create policy funny_admin_upload_read on storage.objects for select to authenticated using(bucket_id='cowriter-uploads' and private.is_funny_admin());

-- Explicit invoker wrappers are the only exposed API. Internal functions use fixed search paths.
grant usage on schema private to anon;
do $$declare f record;begin
 for f in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('private','public') and (p.proname like 'funny_%' or p.proname='is_funny_admin') loop
 execute format('revoke all on function %I.%I(%s) from public,anon,authenticated',f.nspname,f.proname,f.args);
 execute format('grant execute on function %I.%I(%s) to authenticated',f.nspname,f.proname,f.args);
 if f.proname in('funny_feed','funny_image','funny_gallery_read','is_funny_admin') then execute format('grant execute on function %I.%I(%s) to anon',f.nspname,f.proname,f.args);end if;
 end loop;
end $$;

-- Preserve existing claim/idempotency semantics while admitting paired controls.
create or replace function private.cowriter_begin(p_key text,p_request uuid,p_action text,p_fingerprint text,p_session uuid,p_revision integer,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); r private.cowriter_requests; s private.cowriter_sessions; t uuid;
begin
 perform private.check_humor_writer(p_key);
 if p_action not in('draft','shorter','longer','less_obvious','more_obvious','less_mean','more_mean','new_angle','swap','manual','undo') or length(p_fingerprint)<>64 then raise exception 'Invalid request.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,43));
 select * into r from private.cowriter_requests where owner_id=u and id=p_request;
 if found then
  if r.fingerprint<>p_fingerprint then raise exception 'Request key was reused with different content.' using errcode='22023'; end if;
  if r.status='ready' then return jsonb_build_object('cached',true,'state',r.result); end if;
  if r.status='failed' then raise exception 'This attempt ended. Please start a new attempt.'; end if;
  raise exception 'This request is already running.' using errcode='55P03';
 end if;
 if p_action not in('manual','undo') then
  if not (select enabled from private.cowriter_settings where singleton) then raise exception 'The writer is temporarily paused.' using errcode='57014'; end if;
  if (select count(*) from private.cowriter_requests where owner_id=u and action not in('manual','undo') and created_at>now()-interval '24 hours')>=50
   or (select count(*) from private.cowriter_requests where action not in('manual','undo') and created_at>now()-interval '24 hours')>=500 then raise exception 'The daily writing allowance has been reached.' using errcode='54000'; end if;
  if exists(select 1 from private.cowriter_requests where owner_id=u and status='running' and created_at>now()-interval '25 seconds') then raise exception 'A request is still running. Please wait a moment.' using errcode='55P03'; end if;
 end if;
 if p_action='draft' then
  if p_input->>'mode' not in('pic','thought') or length(p_input->>'text')>700 or length(p_input->>'locks')>240 then raise exception 'Invalid draft input.'; end if;
  if p_input->>'mode'='pic' and (split_part(p_input->>'uploadPath','/',1)<>u::text or not exists(select 1 from storage.objects where bucket_id='cowriter-uploads' and name=p_input->>'uploadPath')) then raise exception 'Image not found.' using errcode='42501'; end if;
  if p_input->>'mode'='thought' and length(trim(p_input->>'text'))<3 then raise exception 'Add a thought.'; end if;
  insert into private.cowriter_sessions(owner_id,state) values(u,jsonb_build_object('input',p_input,'options','[]'::jsonb,'pool','[]'::jsonb)) returning * into s;
 else
  select * into s from private.cowriter_sessions where id=p_session and owner_id=u for update;
  if not found then raise exception 'Draft not found.' using errcode='42501'; end if;
  if s.revision<>p_revision then raise exception 'This draft changed. Reload before editing.' using errcode='40001'; end if;
 end if;
 insert into private.cowriter_requests(id,owner_id,session_id,action,fingerprint,base_revision) values(p_request,u,s.id,p_action,p_fingerprint,s.revision) returning token into t;
 return jsonb_build_object('token',t,'sessionId',s.id,'state',s.state||jsonb_build_object('id',s.id,'revision',s.revision));
end $$;
