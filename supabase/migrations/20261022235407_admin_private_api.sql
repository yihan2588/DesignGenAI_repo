-- Exposed RPCs are invoker-only wrappers; checked privileged implementations stay private.
alter function public.admin_access() set schema private;
alter function public.admin_mutate(text,jsonb) set schema private;
alter function public.admin_snapshot(integer) set schema private;
alter function public.humor_experiment_claim(uuid,text) set schema private;
create function public.admin_access() returns boolean language sql security invoker set search_path='' as $$ select private.admin_access() $$;
create function public.admin_mutate(p_action text,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.admin_mutate(p_action,p_data) $$;
create function public.admin_snapshot(p_page integer default 1) returns jsonb language sql security invoker set search_path='' as $$ select private.admin_snapshot(p_page) $$;
create function public.humor_experiment_claim(p_run uuid,p_key text) returns jsonb language sql security invoker set search_path='' as $$ select private.humor_experiment_claim(p_run,p_key) $$;
revoke all on function public.admin_access(),public.admin_mutate(text,jsonb),public.admin_snapshot(integer),public.humor_experiment_claim(uuid,text) from public,anon;
grant execute on function public.admin_access(),public.admin_mutate(text,jsonb),public.admin_snapshot(integer),public.humor_experiment_claim(uuid,text) to authenticated;
