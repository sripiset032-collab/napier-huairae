-- Optional: three sample plots so the app has something to show. Edit or delete later in Settings.
insert into public.plots (site_id, code, name, area_rai, variety, status)
select s.id, v.code, v.name, v.area, 'ปากช่อง 1', 'idle'
from public.sites s,
     (values ('HR-01','แปลง 1', 2.0), ('HR-02','แปลง 2', 1.5), ('HR-03','แปลง 3', 3.0)) as v(code, name, area)
where s.name = 'ห้วยแร่'
on conflict (code) do nothing;
