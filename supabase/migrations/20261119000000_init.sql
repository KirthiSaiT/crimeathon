-- Warden: saved analysis runs, human decisions, held-payment releases, key actions and an audit trail,
-- with role-based access (viewer, analyst, approver) enforced by row-level security.
-- Applied to the "crimethon" Supabase project. Re-running it on a database that already has these objects will fail.

-- Helpers live in a schema the API does not expose, so they cannot be called as RPCs.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create type public.app_role as enum ('viewer', 'analyst', 'approver');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'viewer',
  display_name text,
  created_at timestamptz not null default now()
);

-- Every new sign-up starts as a viewer. An administrator promotes people from the dashboard or the SQL editor.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name) values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;
revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_user();

create function private.current_app_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid());
$$;
revoke execute on function private.current_app_role() from public, anon;
grant execute on function private.current_app_role() to authenticated;

-- One saved run of the detector: the result snapshot plus where it came from.
create table public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  source text not null check (source in ('supplied', 'upload')),
  label text,
  stats jsonb not null,
  files jsonb not null default '[]'::jsonb,
  analysis jsonb not null
);
create index analysis_runs_created_by_idx on public.analysis_runs (created_by);
create index analysis_runs_created_at_idx on public.analysis_runs (created_at desc);

-- An analyst's decision on one alert group of one run.
create table public.alert_reviews (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.analysis_runs (id) on delete cascade,
  alert_key text not null,
  decision text not null check (decision in ('confirmed', 'set_aside', 'needs_info')),
  note text,
  reviewed_by uuid not null default auth.uid() references auth.users (id),
  reviewed_at timestamptz not null default now(),
  unique (run_id, alert_key)
);
create index alert_reviews_reviewed_by_idx on public.alert_reviews (reviewed_by);

-- A supplier bank change released from hold. Rows are never edited or deleted.
create table public.hold_releases (
  id uuid primary key default gen_random_uuid(),
  change_id text not null unique,
  run_id uuid references public.analysis_runs (id) on delete set null,
  released_by uuid not null default auth.uid() references auth.users (id),
  released_at timestamptz not null default now(),
  call_back_confirmed boolean not null check (call_back_confirmed),
  call_back_note text
);
create index hold_releases_run_id_idx on public.hold_releases (run_id);
create index hold_releases_released_by_idx on public.hold_releases (released_by);

-- A request to suspend, quarantine or rotate a key. Recommended by the app; carried out by a person.
create table public.key_actions (
  id uuid primary key default gen_random_uuid(),
  credential_id text not null,
  action text not null check (action in ('suspend', 'quarantine', 'rotate', 'set_expiry')),
  status text not null default 'requested' check (status in ('requested', 'done', 'cancelled')),
  note text,
  requested_by uuid not null default auth.uid() references auth.users (id),
  requested_at timestamptz not null default now(),
  done_at timestamptz
);
create index key_actions_requested_by_idx on public.key_actions (requested_by);
create index key_actions_credential_idx on public.key_actions (credential_id);

-- Who did what. Written by triggers, so it cannot be skipped by the app.
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid references auth.users (id) on delete set null,
  at timestamptz not null default now(),
  action text not null,
  subject text not null,
  detail jsonb not null default '{}'::jsonb
);
create index audit_log_actor_idx on public.audit_log (actor);
create index audit_log_at_idx on public.audit_log (at desc);

create function private.audit_hold_release() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (actor, action, subject, detail)
  values (new.released_by, 'hold_released', new.change_id, jsonb_build_object('run_id', new.run_id, 'note', new.call_back_note));
  return new;
end;
$$;
revoke execute on function private.audit_hold_release() from public, anon, authenticated;
create trigger hold_releases_audit after insert on public.hold_releases
for each row execute function private.audit_hold_release();

create function private.audit_key_action() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (actor, action, subject, detail)
  values ((select auth.uid()), 'key_' || lower(tg_op), new.credential_id, jsonb_build_object('action', new.action, 'status', new.status));
  return new;
end;
$$;
revoke execute on function private.audit_key_action() from public, anon, authenticated;
create trigger key_actions_audit after insert or update on public.key_actions
for each row execute function private.audit_key_action();

-- Nothing here is for signed-out visitors.
revoke all on public.profiles, public.analysis_runs, public.alert_reviews, public.hold_releases, public.key_actions, public.audit_log from anon;

alter table public.profiles enable row level security;
alter table public.analysis_runs enable row level security;
alter table public.alert_reviews enable row level security;
alter table public.hold_releases enable row level security;
alter table public.key_actions enable row level security;
alter table public.audit_log enable row level security;

-- Everyone signed in can read; the right role can write. Roles are changed only by an administrator.
create policy "read own profile" on public.profiles for select to authenticated using (id = (select auth.uid()));

create policy "read runs" on public.analysis_runs for select to authenticated using (true);
create policy "analysts save runs" on public.analysis_runs for insert to authenticated
  with check (created_by = (select auth.uid()) and (select private.current_app_role()) in ('analyst', 'approver'));

create policy "read reviews" on public.alert_reviews for select to authenticated using (true);
create policy "analysts review alerts" on public.alert_reviews for insert to authenticated
  with check (reviewed_by = (select auth.uid()) and (select private.current_app_role()) in ('analyst', 'approver'));
create policy "analysts change own reviews" on public.alert_reviews for update to authenticated
  using (reviewed_by = (select auth.uid()) and (select private.current_app_role()) in ('analyst', 'approver'))
  with check (reviewed_by = (select auth.uid()));

create policy "read releases" on public.hold_releases for select to authenticated using (true);
create policy "only approvers release holds" on public.hold_releases for insert to authenticated
  with check (released_by = (select auth.uid()) and (select private.current_app_role()) = 'approver' and call_back_confirmed);

create policy "read key actions" on public.key_actions for select to authenticated using (true);
create policy "analysts request key actions" on public.key_actions for insert to authenticated
  with check (requested_by = (select auth.uid()) and (select private.current_app_role()) in ('analyst', 'approver'));
create policy "approvers update key actions" on public.key_actions for update to authenticated
  using ((select private.current_app_role()) = 'approver') with check ((select private.current_app_role()) = 'approver');

create policy "staff read audit log" on public.audit_log for select to authenticated
  using ((select private.current_app_role()) in ('analyst', 'approver'));
