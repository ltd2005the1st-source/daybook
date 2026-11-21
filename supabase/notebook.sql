-- My Notebook: free notes with a title, a body and an optional flair (a coloured label).
-- Safe to run more than once.
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null default '',
  body text not null default '',
  flair text,
  flair_color text
);
create index if not exists notes_user_updated on public.notes (user_id, updated_at desc);

alter table public.notes enable row level security;
drop policy if exists own_rows on public.notes;
create policy own_rows on public.notes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop trigger if exists set_owner on public.notes;
create trigger set_owner before insert on public.notes for each row execute function public.ensure_owner();

do $$
begin
  begin
    alter publication supabase_realtime add table public.notes;
  exception when duplicate_object then null;
  end;
  alter table public.notes replica identity full;
end $$;
