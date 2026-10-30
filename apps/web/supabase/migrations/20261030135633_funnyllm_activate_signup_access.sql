-- Initial signup audience chosen by the project owner.
insert into private.funny_signup_rules(kind,value) values
 ('domain','columbia.edu'),('email','yihan2588@gmail.com')
on conflict(kind,value) do nothing;
create trigger funny_signup_allowed before insert on auth.users
for each row execute function private.funny_guard_signup();
