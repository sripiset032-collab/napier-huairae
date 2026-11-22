-- Run in Supabase > SQL Editor if the app is stuck on "กำลังโหลดโปรไฟล์…".
-- 1) Make sure logged-in users can reach the app's tables through the API.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;

-- 2) Create a profile for any user who signed up before the schema existed.
--    If there is no admin yet, the earliest user becomes admin.
insert into public.profiles (id, email, full_name, role)
select u.id, u.email, split_part(u.email, '@', 1),
       case when not exists (select 1 from public.profiles where role = 'admin')
             and u.id = (select id from auth.users order by created_at limit 1)
            then 'admin' else 'pending' end
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

select email, role from public.profiles order by created_at;
