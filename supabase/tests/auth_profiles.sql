-- Run with an administrative SQL connection. All test changes roll back.
begin;
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'food-gallery-test-a@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'food-gallery-test-b@example.invalid');
do $$
begin
  if (select count(*) from public.profiles where id in
    ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222')) <> 2
    then raise exception 'Trigger did not create profiles'; end if;
  if exists (select 1 from public.profiles where id = '11111111-1111-4111-8111-111111111111'
    and (first_name is not null or last_name is not null))
    then raise exception 'New profile names must start NULL'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
do $$
declare changed integer;
begin
  if (select count(*) from public.profiles) <> 1 then raise exception 'Cross-user read allowed'; end if;
  update public.profiles set first_name = 'Intruder'
    where id = '22222222-2222-4222-8222-222222222222';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Cross-user update allowed'; end if;
  update public.profiles set first_name = 'Yihan', last_name = 'Wu'
    where id = '11111111-1111-4111-8111-111111111111';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Owner update denied'; end if;
  begin
    update public.profiles set last_name = '';
    raise exception 'Blank name accepted';
  exception when check_violation then null;
  end;
  begin
    update public.profiles set avatar_path = '22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.jpg';
    raise exception 'Foreign avatar path accepted';
  exception when check_violation then null;
  end;
  begin
    update public.profiles set id = '22222222-2222-4222-8222-222222222222';
    raise exception 'Profile owner reassignment accepted';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.food_photos) <> 12 then raise exception 'Signed-in gallery read failed'; end if;
end $$;
set local role anon;
do $$
begin
  begin
    perform id from public.profiles;
    raise exception 'Anonymous profile read accepted';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.food_photos) <> 12 then raise exception 'Public gallery regressed'; end if;
end $$;
reset role;
delete from auth.users where id = '11111111-1111-4111-8111-111111111111';
do $$
begin
  if exists (select 1 from public.profiles where id = '11111111-1111-4111-8111-111111111111')
    then raise exception 'Profile cascade failed'; end if;
end $$;
rollback;
