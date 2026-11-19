-- Warden: storage for saved analyses and released holds, with role-based access.
-- Written for Supabase (Postgres + Auth). Not yet applied to a live project.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'viewer' check (role in ('analyst', 'approver', 'viewer')),
  created_at timestamptz not null default now()
);

-- Every new sign-up starts as a viewer. An administrator promotes people in the table.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create function public.current_app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create table public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  source text not null check (source in ('supplied', 'upload')),
  stats jsonb not null,
  analysis jsonb not null
);

create table public.hold_releases (
  id uuid primary key default gen_random_uuid(),
  change_id text not null,
  run_id uuid references public.analysis_runs (id),
  released_by uuid not null default auth.uid() references auth.users (id),
  released_at timestamptz not null default now(),
  call_back_confirmed boolean not null check (call_back_confirmed)
);
create unique index hold_releases_change_unique on public.hold_releases (change_id);

alter table public.profiles enable row level security;
alter table public.analysis_runs enable row level security;
alter table public.hold_releases enable row level security;

-- Everyone signed in can read; only the right role can write.
create policy "read own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "read runs" on public.analysis_runs for select to authenticated using (true);
create policy "analysts save runs" on public.analysis_runs for insert to authenticated
  with check (public.current_app_role() in ('analyst', 'approver'));
create policy "read releases" on public.hold_releases for select to authenticated using (true);
create policy "only approvers release holds" on public.hold_releases for insert to authenticated
  with check (public.current_app_role() = 'approver' and call_back_confirmed);
