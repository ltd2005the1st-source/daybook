-- Daybook upgrade, 17 Nov 2026. Safe to run more than once.
-- Adds: homework checks as tasks, Spotify music, classes as calendar events,
-- per-repeat notes on events, and movable homework checks.

-- Homework checks
alter table public.students add column if not exists check_note text;
alter table public.students add column if not exists check_offset int not null default 1;
alter table public.tasks add column if not exists student_id uuid references public.students on delete cascade;
alter table public.tasks add column if not exists check_for date;
update public.tasks set check_for = due_on + 1 where student_id is not null and check_for is null and due_on is not null;
drop index if exists public.tasks_one_check_per_night;
create unique index if not exists tasks_one_check_per_class on public.tasks (user_id, student_id, check_for) where student_id is not null;

-- Events: classes link to a student; a repeat can have its own notes
alter table public.events add column if not exists student_id uuid references public.students on delete cascade;
alter table public.events add column if not exists occurrence_notes jsonb not null default '{}';

-- Music (Spotify links)
create table if not exists public.music (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  title text not null,
  kind text not null check (kind in ('playlist','album','track','artist','episode','show')),
  spotify_id text not null,
  image text,
  sort int not null default 0
);
alter table public.music enable row level security;
drop policy if exists own_rows on public.music;
create policy own_rows on public.music for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop trigger if exists set_owner on public.music;
create trigger set_owner before insert on public.music for each row execute function public.ensure_owner();
do $$ begin
  alter publication supabase_realtime add table public.music;
exception when duplicate_object then null;
end $$;
alter table public.music replica identity full;

-- Move weekly class times (slots) into repeating events, once per student.
-- The old slots are left in place as a backup; the app no longer reads them.
do $$
declare r record;
begin
  for r in
    select s.user_id, s.id as student_id, s.name, s.color, sl.start_time, sl.end_time, sl.tentative,
           array_agg(distinct sl.weekday order by sl.weekday) as days,
           least(coalesce((select min(l.date) from public.lessons l where l.student_id = s.id), date '2026-11-01'), date '2026-11-01') as first_day
    from public.slots sl
    join public.students s on s.id = sl.student_id
    where not exists (select 1 from public.events e where e.student_id = s.id)
    group by s.user_id, s.id, s.name, s.color, sl.start_time, sl.end_time, sl.tentative
  loop
    insert into public.events (user_id, title, date, start_time, end_time, days, color, kind, remind_before, student_id)
    values (r.user_id, 'Teach ' || r.name || case when r.tentative then ' (pending)' else '' end,
            r.first_day, r.start_time, r.end_time, r.days, r.color, 'class', '{40,20}', r.student_id);
  end loop;
end $$;

-- A class that was moved used to leave a "Moved to …" mark on its usual day and a "planned" row with the
-- new time. Now the series skips that day and the class becomes a one-off event.
do $$
declare l record; series_id uuid; series_title text; series_color text;
begin
  for l in
    select * from public.lessons
    where (status = 'cancelled' and note like 'Moved to%')
       or status = 'planned'
       or start_time is not null
  loop
    select e.id, e.title, e.color into series_id, series_title, series_color
    from public.events e
    where e.student_id = l.student_id and cardinality(e.days) > 0 and e.date <= l.date
      and extract(dow from l.date)::int = any(e.days)
    limit 1;

    if series_id is not null then
      update public.events set skip_dates = array_append(skip_dates, l.date::text)
      where id = series_id and not (l.date::text = any(skip_dates));
    end if;

    if not (l.status = 'cancelled' and coalesce(l.note, '') like 'Moved to%') and l.start_time is not null then
      insert into public.events (user_id, title, date, start_time, end_time, days, color, kind, remind_before, student_id)
      select l.user_id, coalesce(series_title, 'Teach ' || s.name), l.date, l.start_time, l.end_time, '{}',
             coalesce(series_color, s.color), 'class', '{40,20}', l.student_id
      from public.students s where s.id = l.student_id;
    end if;

    if l.status = 'planned' or (l.status = 'cancelled' and coalesce(l.note, '') like 'Moved to%') then
      delete from public.lessons where id = l.id;
    else
      update public.lessons set start_time = null, end_time = null where id = l.id;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Restore weekly classes, 18 Nov 2026. Safe to run more than once.
-- Puts back every weekly class as a repeating calendar event linked to its
-- student, which also brings back each student's homework check (a task the
-- night before every class, at 22:30 unless you moved it).
-- ---------------------------------------------------------------------------
do $$
declare
  me uuid;
  c record;
  sid uuid;
  scolor text;
begin
  select user_id into me from public.students group by user_id order by count(*) desc limit 1;
  if me is null then
    select id into me from auth.users order by created_at limit 1;
  end if;

  -- Clear the old weekly series for these students, and plain events with the same titles,
  -- so nothing shows twice. One-off (moved) classes and the register are kept.
  delete from public.events e
  where e.user_id = me and cardinality(e.days) > 0
    and (e.student_id in (select id from public.students
                          where user_id = me and lower(trim(name)) in ('leweekend','tống linh','khánh an','bảo hân','bách'))
         or (e.student_id is null and lower(e.title) in ('ielts weekend class','dạy tống linh','dạy khánh an','dạy bảo hân','dạy bách')));

  -- name, kind, members, colour, rate: used only if the student is missing
  for c in
    select * from (values
      ('leWeekend', 'class',   array['Khánh','Hân','Nhật','Trí'], '#5B86E5', 600000, 'IELTS Weekend Class', '20:30', '22:30', array[6]),
      ('leWeekend', 'class',   array['Khánh','Hân','Nhật','Trí'], '#5B86E5', 600000, 'IELTS Weekend Class', '09:00', '11:00', array[0]),
      ('Tống Linh', 'student', array[]::text[],                   '#3F8250', 350000, 'Dạy Tống Linh',       '20:30', '22:30', array[1,3,5]),
      ('Khánh An',  'student', array[]::text[],                   '#525A80', 400000, 'Dạy Khánh An',        '18:30', '20:30', array[3,5]),
      ('Bảo Hân',   'student', array[]::text[],                   '#9A6FB0', 400000, 'Dạy Bảo Hân',         '20:30', '22:30', array[2]),
      ('Bảo Hân',   'student', array[]::text[],                   '#9A6FB0', 400000, 'Dạy Bảo Hân',         '18:30', '20:30', array[4]),
      ('Bách',      'student', array[]::text[],                   '#8A3FB0', 400000, 'Dạy Bách',            '20:30', '22:30', array[4])
    ) as t(name, kind, members, color, rate, title, start_time, end_time, days)
  loop
    select id, color into sid, scolor from public.students
    where user_id = me and lower(trim(name)) = lower(c.name)
    limit 1;
    if sid is null then
      insert into public.students (user_id, name, kind, members, color, rate, active)
      values (me, c.name, c.kind, c.members, c.color, c.rate, true)
      returning id, color into sid, scolor;
    else
      update public.students set active = true where id = sid;
    end if;

    insert into public.events (user_id, title, date, start_time, end_time, days, color, kind, remind_before, student_id)
    values (me, c.title, date '2026-11-01', c.start_time, c.end_time, c.days, scolor, 'class', '{40,20}', sid);
  end loop;
end $$;
