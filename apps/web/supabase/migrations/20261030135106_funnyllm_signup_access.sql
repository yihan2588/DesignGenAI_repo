-- Signup eligibility is independent of administrator authorization.
create table private.funny_signup_rules (
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('domain','email')),
 value text not null check(value=lower(btrim(value)) and length(value) between 3 and 254),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(kind,value)
);
alter table private.funny_signup_rules enable row level security;
revoke all on private.funny_signup_rules from public,anon,authenticated;
create function private.funny_signup_matches(p_email text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(p_email ~ '^[^@[:space:]]+@[^@[:space:]]+$' and exists(
  select 1 from private.funny_signup_rules where
  (kind='email' and value=lower(btrim(p_email))) or
  (kind='domain' and value=split_part(lower(btrim(p_email)),'@',2))
 ),false)
$$;
revoke all on function private.funny_signup_matches(text) from public,anon,authenticated;

create function private.funny_signup_access(p_action text default 'list',p_kind text default null,p_id uuid default null,p_value text default null,p_expected text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v text:=lower(btrim(p_value)); result_id uuid; matched text;
begin
 perform private.require_superadmin();
 if p_action='list' then
  return jsonb_build_object('enforced',exists(select 1 from pg_catalog.pg_trigger where tgname='funny_signup_allowed' and tgrelid='auth.users'::regclass and tgenabled<>'D'),'rules',coalesce((select jsonb_agg(r order by kind,value) from private.funny_signup_rules r),'[]'::jsonb));
 elsif p_action='check' then
  select kind into matched from private.funny_signup_rules where (kind='email' and value=v) or (kind='domain' and value=split_part(v,'@',2)) order by kind desc limit 1;
  return jsonb_build_object('allowed',private.funny_signup_matches(v),'reason',matched);
 end if;
 if p_kind is null or p_kind not in ('domain','email') or p_action not in ('save','delete') then raise exception 'Unsupported signup rule action.';end if;
 perform pg_advisory_xact_lock(8120051);
 if p_action='save' then
  if v is null or length(v)>254 or
    (p_kind='domain' and (length(v)>253 or v !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$')) or
    (p_kind='email' and (v !~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$' or length(split_part(v,'@',1))>64 or split_part(v,'@',1) like '.%' or split_part(v,'@',1) like '%.' or position('..' in split_part(v,'@',1))>0))
    then raise exception 'Enter a valid domain or email address without wildcards.';end if;
  if exists(select 1 from private.funny_signup_rules where kind=p_kind and value=v and (p_id is null or id<>p_id)) then raise exception 'This signup rule already exists.';end if;
  if p_id is null then
   if (select count(*) from private.funny_signup_rules)>=1000 then raise exception 'Signup rule limit reached (1000).';end if;
   insert into private.funny_signup_rules(kind,value) values(p_kind,v) returning id into result_id;
  else
   update private.funny_signup_rules set value=v,updated_at=now() where id=p_id and kind=p_kind and value=p_expected returning id into result_id;
   if not found then raise exception 'This rule changed or was removed. Refresh and try again.';end if;
  end if;
 else
  delete from private.funny_signup_rules where id=p_id and kind=p_kind and value=p_expected returning id into result_id;
  if not found then raise exception 'This rule changed or was removed. Refresh and try again.';end if;
 end if;
 insert into private.admin_audit(actor,action,target) values(auth.uid(),'funny:signup_'||p_action,result_id::text);
 return jsonb_build_object('id',result_id);
end $$;
create function public.funny_signup_access(p_action text default 'list',p_kind text default null,p_id uuid default null,p_value text default null,p_expected text default null)
returns jsonb language sql security invoker set search_path='' as $$select private.funny_signup_access(p_action,p_kind,p_id,p_value,p_expected)$$;
revoke all on function private.funny_signup_access(text,text,uuid,text,text),public.funny_signup_access(text,text,uuid,text,text) from public,anon;
grant execute on function private.funny_signup_access(text,text,uuid,text,text),public.funny_signup_access(text,text,uuid,text,text) to authenticated;

-- Runs before account creation, including direct Auth API calls. Existing users are unaffected.
create function private.funny_guard_signup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not private.funny_signup_matches(new.email) then
  raise exception 'New signups require an allowed email domain or an email exception.' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function private.funny_guard_signup() from public,anon,authenticated;
-- Initial rules and trigger are installed after the operator selects the initial audience.
