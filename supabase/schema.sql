-- =============================================================
-- Napier Huai Rae (ห้วยแร่) – database schema for Supabase
-- Run once in Supabase > SQL Editor. Safe to re-run on an empty project.
-- =============================================================

-- ---------- Users & roles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'pending' check (role in ('admin','staff','viewer','pending')),
  created_at timestamptz not null default now()
);

-- Emails the admin has invited, with the role they get on sign-up.
create table if not exists public.invitations (
  email text primary key,
  role text not null default 'staff' check (role in ('admin','staff','viewer')),
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'pending');
$$;

create or replace function public.is_member() returns boolean
language sql stable as $$ select public.my_role() in ('admin','staff','viewer') $$;

create or replace function public.is_admin() returns boolean
language sql stable as $$ select public.my_role() = 'admin' $$;

create or replace function public.can_write() returns boolean
language sql stable as $$ select public.my_role() in ('admin','staff') $$;

-- New auth user -> profile. First user ever = admin; invited email = invited role; else pending.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r text;
begin
  if not exists (select 1 from public.profiles) then
    r := 'admin';
  else
    select role into r from public.invitations where lower(email) = lower(new.email);
    r := coalesce(r, 'pending');
  end if;
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), r);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Master data (admin manages) ----------
create table if not exists public.sites (
  id bigint generated always as identity primary key,
  name text not null unique,
  district text,
  province text,
  created_at timestamptz not null default now()
);

create table if not exists public.plots (
  id bigint generated always as identity primary key,
  site_id bigint not null references public.sites(id),
  code text not null unique,
  name text,
  area_rai numeric(10,2) not null default 1 check (area_rai > 0),
  variety text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  status text not null default 'idle' check (status in ('active','idle','fallow')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_types (
  id bigint generated always as identity primary key,
  name text not null unique,
  uses_fertilizer boolean not null default false,
  sort_order int not null default 100
);

create table if not exists public.fertilizers (
  id bigint generated always as identity primary key,
  name text not null unique,
  formula text,
  unit text not null default 'กก.',
  price_per_unit numeric(12,2),
  active boolean not null default true
);

create table if not exists public.cost_categories (
  id bigint generated always as identity primary key,
  name text not null unique,
  sort_order int not null default 100
);

-- ---------- Field records (staff + admin write) ----------
create table if not exists public.plantings (
  id bigint generated always as identity primary key,
  plot_id bigint not null references public.plots(id) on delete cascade,
  plant_date date not null,
  variety text,
  method text,
  spacing_cm text,
  cuttings_qty int,
  end_date date,
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= plant_date)
);

create table if not exists public.harvests (
  id bigint generated always as identity primary key,
  planting_id bigint not null references public.plantings(id) on delete cascade,
  cut_date date not null,
  cut_no int,
  height_cm numeric(8,1),
  fresh_weight_kg numeric(12,2) not null check (fresh_weight_kg >= 0),
  area_rai numeric(10,2) check (area_rai is null or area_rai > 0),
  destination text check (destination in ('sale','feed','silage','other')),
  revenue_baht numeric(12,2),
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.activities (
  id bigint generated always as identity primary key,
  plot_id bigint not null references public.plots(id) on delete cascade,
  planting_id bigint references public.plantings(id) on delete set null,
  activity_date date not null,
  activity_type_id bigint not null references public.activity_types(id),
  fertilizer_id bigint references public.fertilizers(id),
  fertilizer_qty numeric(12,2),
  workers int,
  notes text,
  photo_path text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.costs (
  id bigint generated always as identity primary key,
  plot_id bigint not null references public.plots(id) on delete cascade,
  activity_id bigint references public.activities(id) on delete cascade,
  cost_date date not null,
  category_id bigint not null references public.cost_categories(id),
  amount_baht numeric(12,2) not null check (amount_baht >= 0),
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists plantings_plot_idx on public.plantings(plot_id);
create index if not exists harvests_planting_idx on public.harvests(planting_id);
create index if not exists activities_plot_idx on public.activities(plot_id, activity_date desc);
create index if not exists costs_plot_idx on public.costs(plot_id, cost_date desc);

-- Harvest number (ครั้งที่) and default area filled automatically.
create or replace function public.harvest_defaults() returns trigger
language plpgsql as $$
begin
  if new.cut_no is null then
    select coalesce(max(cut_no), 0) + 1 into new.cut_no from public.harvests where planting_id = new.planting_id;
  end if;
  if new.area_rai is null then
    select p.area_rai into new.area_rai from public.plantings pl join public.plots p on p.id = pl.plot_id where pl.id = new.planting_id;
  end if;
  return new;
end $$;
drop trigger if exists harvest_defaults on public.harvests;
create trigger harvest_defaults before insert on public.harvests
  for each row execute function public.harvest_defaults();

-- Plot status follows its plantings: a new planting makes it active, closing the last one makes it idle.
create or replace function public.sync_plot_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.plots p set status = case
    when exists (select 1 from public.plantings x where x.plot_id = p.id and x.end_date is null) then 'active'
    when p.status = 'active' then 'idle' else p.status end
  where p.id = coalesce(new.plot_id, old.plot_id);
  return null;
end $$;
drop trigger if exists sync_plot_status on public.plantings;
create trigger sync_plot_status after insert or update of end_date or delete on public.plantings
  for each row execute function public.sync_plot_status();

-- Records stay owned by their author.
create or replace function public.keep_author() returns trigger
language plpgsql as $$
begin
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['plantings','harvests','activities','costs'] loop
    execute format('drop trigger if exists keep_author on public.%I', t);
    execute format('create trigger keep_author before update on public.%I for each row execute function public.keep_author()', t);
  end loop;
end $$;

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.invitations enable row level security;
alter table public.sites enable row level security;
alter table public.plots enable row level security;
alter table public.activity_types enable row level security;
alter table public.fertilizers enable row level security;
alter table public.cost_categories enable row level security;
alter table public.plantings enable row level security;
alter table public.harvests enable row level security;
alter table public.activities enable row level security;
alter table public.costs enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (id = auth.uid() or public.is_member());
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists profiles_admin_delete on public.profiles;
create policy profiles_admin_delete on public.profiles for delete using (public.is_admin() and id <> auth.uid());

drop policy if exists invitations_admin on public.invitations;
create policy invitations_admin on public.invitations for all using (public.is_admin()) with check (public.is_admin());

-- Master data: members read, admin writes.
do $$ declare t text; begin
  foreach t in array array['sites','plots','activity_types','fertilizers','cost_categories'] loop
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format('create policy %I on public.%I for select using (public.is_member())', t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_admin', t);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t||'_admin', t);
  end loop;
end $$;

-- Field records: members read; staff/admin add; admin edits anything, staff edits own within 7 days.
do $$ declare t text; begin
  foreach t in array array['plantings','harvests','activities','costs'] loop
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format('create policy %I on public.%I for select using (public.is_member())', t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_insert', t);
    execute format('create policy %I on public.%I for insert with check (public.can_write() and created_by = auth.uid())', t||'_insert', t);
    execute format('drop policy if exists %I on public.%I', t||'_update', t);
    execute format($p$create policy %I on public.%I for update
      using (public.is_admin() or (public.can_write() and created_by = auth.uid() and created_at > now() - interval '7 days'))
      with check (public.is_admin() or (public.can_write() and created_by = auth.uid()))$p$, t||'_update', t);
    execute format('drop policy if exists %I on public.%I', t||'_delete', t);
    execute format($p$create policy %I on public.%I for delete
      using (public.is_admin() or (public.can_write() and created_by = auth.uid() and created_at > now() - interval '7 days'))$p$, t||'_delete', t);
  end loop;
end $$;

-- ---------- Report view ----------
create or replace view public.plot_summary with (security_invoker = true) as
with cur as (
  select distinct on (plot_id) plot_id, id as planting_id, plant_date
  from public.plantings where end_date is null
  order by plot_id, plant_date desc
),
h as (
  select pl.plot_id, sum(h.fresh_weight_kg) as total_kg, count(*) as cuts,
         max(h.cut_date) as last_cut, sum(coalesce(h.revenue_baht,0)) as revenue
  from public.harvests h join public.plantings pl on pl.id = h.planting_id
  group by pl.plot_id
),
c as (
  select plot_id, sum(amount_baht) as total_cost from public.costs group by plot_id
)
select p.id as plot_id, p.code, p.name, p.area_rai, p.status, s.name as site_name,
       cur.planting_id, cur.plant_date,
       coalesce(h.cuts,0) as cuts,
       coalesce(h.total_kg,0) as total_kg,
       h.last_cut,
       (current_date - coalesce(h.last_cut, cur.plant_date)) as days_since_cut,
       coalesce(c.total_cost,0) as total_cost,
       coalesce(h.revenue,0) as revenue,
       round(coalesce(h.total_kg,0) / p.area_rai, 1) as kg_per_rai,
       round(coalesce(c.total_cost,0) / p.area_rai, 2) as cost_per_rai,
       case when coalesce(h.total_kg,0) > 0 then round(coalesce(c.total_cost,0) / h.total_kg, 2) end as cost_per_kg
from public.plots p
join public.sites s on s.id = p.site_id
left join cur on cur.plot_id = p.id
left join h on h.plot_id = p.id
left join c on c.plot_id = p.id;

-- ---------- API access (Row Level Security above still decides what each user sees) ----------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- ---------- Photo storage ----------
insert into storage.buckets (id, name, public) values ('photos','photos', false)
on conflict (id) do nothing;

drop policy if exists photos_read on storage.objects;
create policy photos_read on storage.objects for select using (bucket_id = 'photos' and public.is_member());
drop policy if exists photos_insert on storage.objects;
create policy photos_insert on storage.objects for insert with check (bucket_id = 'photos' and public.can_write());
drop policy if exists photos_delete on storage.objects;
create policy photos_delete on storage.objects for delete using (bucket_id = 'photos' and (public.is_admin() or owner = auth.uid()));

-- ---------- Starter data ----------
insert into public.sites (name, district, province) values ('ห้วยแร่', null, null) on conflict (name) do nothing;

insert into public.activity_types (name, uses_fertilizer, sort_order) values
  ('ไถพรวน', false, 10), ('ไถดะ', false, 11), ('ไถแปร', false, 12), ('ยกร่อง', false, 13),
  ('ปลูก/ปลูกซ่อม', false, 20), ('ให้ปุ๋ย', true, 30), ('รดน้ำ/ให้น้ำ', false, 40),
  ('กำจัดวัชพืช', false, 50), ('ฉีดพ่นสารเคมี', false, 60), ('ซ่อมแซมระบบน้ำ', false, 70), ('อื่นๆ', false, 999)
on conflict (name) do nothing;

insert into public.fertilizers (name, formula, unit, price_per_unit) values
  ('ยูเรีย', '46-0-0', 'กก.', null), ('ปุ๋ยสูตรเสมอ', '15-15-15', 'กก.', null),
  ('ปุ๋ยแอมโมเนียมซัลเฟต', '21-0-0', 'กก.', null), ('ปุ๋ยคอก (มูลวัว)', null, 'กก.', null),
  ('ปุ๋ยหมัก', null, 'กก.', null)
on conflict (name) do nothing;

insert into public.cost_categories (name, sort_order) values
  ('ปุ๋ย', 10), ('ค่าแรง', 20), ('น้ำมันเชื้อเพลิง', 30), ('ค่าเช่าเครื่องจักร', 40),
  ('ท่อนพันธุ์', 50), ('ค่าน้ำ/ไฟ', 60), ('สารเคมี', 70), ('อื่นๆ', 999)
on conflict (name) do nothing;
