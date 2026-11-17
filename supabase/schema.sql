-- Daybook schema. Paste this whole file into Supabase → SQL Editor → Run.
-- Every table is private to the signed-in user (row level security) and
-- broadcasts changes in real time so your phone and laptop stay in sync.

create extension if not exists pgcrypto;

create or replace function public.ensure_owner() returns trigger language plpgsql as $$
begin
  if new.user_id is null then new.user_id := auth.uid(); end if;
  return new;
end $$;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('income','expense')),
  amount bigint not null,
  title text not null,
  category text not null default 'Other',
  date date not null,
  recurring boolean not null default false,
  note text
);

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  direction text not null check (direction in ('receivable','payable')),
  person text not null,
  amount bigint not null,
  note text,
  due_on date,
  settled boolean not null default false,
  student_id uuid
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  name text not null,
  kind text not null default 'student' check (kind in ('student','class')),
  members text[] not null default '{}',
  color text not null default '#5B86E5',
  rate bigint not null default 0,
  makeup_baseline int not null default 0,
  active boolean not null default true,
  check_note text,
  check_mode text not null default 'night_before' check (check_mode in ('night_before','fixed')),
  check_time text not null default '22:30',
  check_days int[] not null default '{}',
  check_minutes int not null default 60,
  remind_before int[] not null default '{40,20}',
  availability jsonb,
  note text,
  sort int not null default 0
);

create table if not exists public.slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  student_id uuid not null references public.students on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  start_time text not null,
  end_time text not null,
  tentative boolean not null default false
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  student_id uuid not null references public.students on delete cascade,
  date date not null,
  status text not null check (status in ('taught','missed_owe','cancelled','planned')),
  start_time text,
  end_time text,
  note text,
  unique (student_id, date)
);

create table if not exists public.homework (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  student_id uuid not null references public.students on delete cascade,
  title text not null,
  note text,
  assigned_on date not null default current_date,
  status text not null default 'open' check (status in ('open','checked')),
  checked_on date
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  student_id uuid not null references public.students on delete cascade,
  month text not null,
  sessions int not null,
  rate bigint not null,
  adjustments bigint not null default 0,
  amount bigint not null,
  status text not null default 'issued' check (status in ('issued','paid')),
  paid_on date,
  dates text[] not null default '{}',
  note text
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  title text not null,
  date date not null,
  start_time text,
  end_time text,
  days int[] not null default '{}',
  until date,
  color text not null default '#4A51AC',
  kind text not null default 'personal',
  remind_before int[] not null default '{40,20}',
  notes text,
  skip_dates text[] not null default '{}'
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  title text not null,
  notes text,
  list text not null default 'Personal',
  due_on date,
  due_time text,
  priority boolean not null default false,
  horizon text not null default 'now' check (horizon in ('now','soon','long')),
  done boolean not null default false,
  done_at timestamptz,
  sort int not null default 0,
  student_id uuid references public.students on delete cascade
);

create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  task_id uuid not null references public.tasks on delete cascade,
  title text not null,
  done boolean not null default false,
  sort int not null default 0
);

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  name text not null,
  kind text not null default 'custom' check (kind in ('sleep','exercise','custom')),
  color text not null default '#3F8250',
  target_bedtime text,
  target_wake text,
  weekly_target int,
  sort int not null default 0
);

create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  habit_id uuid not null references public.habits on delete cascade,
  date date not null,
  slept_at text,
  woke_at text,
  minutes int,
  activity text,
  note text
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  endpoint text not null unique,
  subscription jsonb not null
);

create table if not exists public.notifications_sent (
  key text primary key,
  user_id uuid not null references auth.users on delete cascade,
  sent_at timestamptz not null default now()
);

-- Row level security: you only ever see your own rows.
do $$
declare t text;
begin
  foreach t in array array['transactions','debts','students','slots','lessons','homework','receipts',
    'events','tasks','milestones','habits','habit_logs','push_subscriptions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format('create policy own_rows on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('drop trigger if exists set_owner on public.%I', t);
    execute format('create trigger set_owner before insert on public.%I for each row execute function public.ensure_owner()', t);
  end loop;
end $$;
alter table public.notifications_sent enable row level security;

-- Real-time sync.
do $$
declare t text;
begin
  foreach t in array array['transactions','debts','students','slots','lessons','homework','receipts',
    'events','tasks','milestones','habits','habit_logs']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;

-- Upgrades for databases made before these columns existed (safe to run again).
alter table public.students add column if not exists check_note text;
alter table public.tasks add column if not exists student_id uuid references public.students on delete cascade;
create unique index if not exists tasks_one_check_per_night on public.tasks (user_id, student_id, due_on) where student_id is not null;
