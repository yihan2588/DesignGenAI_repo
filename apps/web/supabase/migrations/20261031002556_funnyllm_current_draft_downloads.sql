create or replace function private.funny_record_download(p_key text,p_post uuid default null,p_session uuid default null,p_revision integer default null,p_option uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare p private.funny_posts;s jsonb;o jsonb;path text;bucket text;
begin
 if p_key is null or not exists(select 1 from private.humor_config where writer_key_sha256=encode(extensions.digest(p_key,'sha256'),'hex')) then raise exception 'Writer denied.' using errcode='42501';end if;
 if p_post is not null then
  select * into p from private.funny_posts where id=p_post and (status='published' or owner_id=auth.uid() or private.is_funny_admin());
  if not found then raise exception 'Meme unavailable.';end if;
  insert into private.funny_downloads(actor,source,post_id,session_id,revision,option_id,caption,image_id,bucket,path,width,height) values(auth.uid(),'gallery',p.id,p.session_id,p.revision,p.option_id,p.caption,coalesce((select c.id::text from public.cowriter_catalog c where c.storage_path=p.image_path limit 1),(select opt->>'image_id' from private.cowriter_revisions r cross join lateral jsonb_array_elements(r.state->'options') opt where r.session_id=p.session_id and r.revision=p.revision and opt->>'id'=p.option_id::text limit 1)),p.bucket,p.image_path,p.width,p.height);
 else
  -- The latest state lives on the session; the revisions table holds undo history.
  s:=private.cowriter_read(p_session);
  if (s->>'revision')::integer is distinct from p_revision then raise exception 'Draft changed. Reload before downloading.' using errcode='40001';end if;
  select value into o from jsonb_array_elements(s->'options') where value->>'id'=p_option::text;
  if o is null then raise exception 'Take unavailable.';end if;
  if o->>'image_id'='upload' then path:=s->'input'->>'uploadPath';bucket:='cowriter-uploads';
  else select storage_path into path from public.cowriter_catalog where id=(o->>'image_id')::uuid;bucket:=case when path like 'managed/%' then 'funny-library' else 'catalog' end;end if;
  insert into private.funny_downloads(actor,source,session_id,revision,option_id,caption,image_id,bucket,path,width,height) values(auth.uid(),'lab',p_session,p_revision,p_option,o->>'caption',o->>'image_id',bucket,path,(o->>'width')::int,(o->>'height')::int);
 end if;
end $$;
