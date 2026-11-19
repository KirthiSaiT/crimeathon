-- Role-based access control: permissions are data, every policy asks for a permission instead of a role name,
-- and releasing a held bank change needs a second person. Applied after 20261120000001_rbac_roles.sql,
-- which adds the 'admin' and 'vendor' values to public.app_role (a new enum value cannot be used in the same transaction).

alter table public.profiles add column email text;

-- The first account becomes the administrator so someone can assign roles; everyone after starts as a viewer.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, email, role)
  values (
    new.id,
    split_part(new.email, '@', 1),
    new.email,
    case when exists (select 1 from public.profiles where role = 'admin') then 'viewer'::public.app_role else 'admin'::public.app_role end
  );
  return new;
end;
$$;

-- What each role may do. Admin manages access, not money; approver moves money, not access.
create table public.role_permissions (
  role public.app_role not null,
  permission text not null,
  primary key (role, permission)
);
insert into public.role_permissions (role, permission) values
  ('viewer', 'view_case'),
  ('analyst', 'view_case'), ('analyst', 'save_run'), ('analyst', 'review_alert'), ('analyst', 'request_key_action'), ('analyst', 'request_release'), ('analyst', 'view_audit'),
  ('approver', 'view_case'), ('approver', 'release_hold'), ('approver', 'resolve_key_action'), ('approver', 'view_audit'),
  ('admin', 'view_case'), ('admin', 'manage_roles'), ('admin', 'manage_settings'), ('admin', 'view_audit');
-- 'vendor' has no rows on purpose: a vendor account can sign in and sees nothing of the case.

create table public.app_settings (
  id boolean primary key default true check (id),
  two_person_rule boolean not null default true,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.app_settings default values;
create index app_settings_updated_by_idx on public.app_settings (updated_by);

create function private.has_permission(p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles pr
    join public.role_permissions rp on rp.role = pr.role
    where pr.id = (select auth.uid()) and rp.permission = p
  );
$$;
revoke execute on function private.has_permission(text) from public, anon;
grant execute on function private.has_permission(text) to authenticated;

-- A request to release a held change, made by one person and approved by another.
create table public.hold_requests (
  id uuid primary key default gen_random_uuid(),
  change_id text not null unique,
  requested_by uuid not null default auth.uid() references auth.users (id),
  requested_at timestamptz not null default now(),
  note text
);
create index hold_requests_requested_by_idx on public.hold_requests (requested_by);

revoke all on public.role_permissions, public.app_settings, public.hold_requests from anon;
alter table public.role_permissions enable row level security;
alter table public.app_settings enable row level security;
alter table public.hold_requests enable row level security;

-- Replace the role-name policies with permission policies.
drop policy "read own profile" on public.profiles;
drop policy "read runs" on public.analysis_runs;
drop policy "analysts save runs" on public.analysis_runs;
drop policy "read reviews" on public.alert_reviews;
drop policy "analysts review alerts" on public.alert_reviews;
drop policy "analysts change own reviews" on public.alert_reviews;
drop policy "read releases" on public.hold_releases;
drop policy "only approvers release holds" on public.hold_releases;
drop policy "read key actions" on public.key_actions;
drop policy "analysts request key actions" on public.key_actions;
drop policy "approvers update key actions" on public.key_actions;
drop policy "staff read audit log" on public.audit_log;

create policy "read own profile or manage roles" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.has_permission('manage_roles')));
create policy "managers change roles" on public.profiles for update to authenticated
  using ((select private.has_permission('manage_roles'))) with check ((select private.has_permission('manage_roles')));
revoke update on public.profiles from authenticated;
grant update (role) on public.profiles to authenticated;

create policy "read permissions" on public.role_permissions for select to authenticated using (true);

create policy "read settings" on public.app_settings for select to authenticated using (true);
create policy "managers change settings" on public.app_settings for update to authenticated
  using ((select private.has_permission('manage_settings'))) with check ((select private.has_permission('manage_settings')));

create policy "read runs" on public.analysis_runs for select to authenticated using ((select private.has_permission('view_case')));
create policy "save runs" on public.analysis_runs for insert to authenticated
  with check (created_by = (select auth.uid()) and (select private.has_permission('save_run')));

create policy "read reviews" on public.alert_reviews for select to authenticated using ((select private.has_permission('view_case')));
create policy "review alerts" on public.alert_reviews for insert to authenticated
  with check (reviewed_by = (select auth.uid()) and (select private.has_permission('review_alert')));
create policy "change own reviews" on public.alert_reviews for update to authenticated
  using (reviewed_by = (select auth.uid()) and (select private.has_permission('review_alert')))
  with check (reviewed_by = (select auth.uid()));

create policy "read key actions" on public.key_actions for select to authenticated using ((select private.has_permission('view_case')));
create policy "request key actions" on public.key_actions for insert to authenticated
  with check (requested_by = (select auth.uid()) and (select private.has_permission('request_key_action')));
create policy "resolve key actions" on public.key_actions for update to authenticated
  using ((select private.has_permission('resolve_key_action'))) with check ((select private.has_permission('resolve_key_action')));

create policy "read hold requests" on public.hold_requests for select to authenticated using ((select private.has_permission('view_case')));
create policy "request a release" on public.hold_requests for insert to authenticated
  with check (requested_by = (select auth.uid()) and (select private.has_permission('request_release')));

create policy "read releases" on public.hold_releases for select to authenticated using ((select private.has_permission('view_case')));
-- The two-person rule: unless an administrator has turned it off, a release needs a request from someone else.
create policy "approvers release holds" on public.hold_releases for insert to authenticated
  with check (
    released_by = (select auth.uid())
    and call_back_confirmed
    and (select private.has_permission('release_hold'))
    and (
      not (select two_person_rule from public.app_settings)
      or exists (select 1 from public.hold_requests r where r.change_id = hold_releases.change_id and r.requested_by <> (select auth.uid()))
    )
  );

create policy "staff read audit log" on public.audit_log for select to authenticated using ((select private.has_permission('view_audit')));

-- Role changes, settings changes and release requests join the audit trail.
create function private.audit_role_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role is distinct from old.role then
    if new.id = (select auth.uid()) then
      raise exception 'You cannot change your own role.';
    end if;
    insert into public.audit_log (actor, action, subject, detail)
    values ((select auth.uid()), 'role_changed', coalesce(new.email, new.id::text), jsonb_build_object('from', old.role, 'to', new.role));
  end if;
  return new;
end;
$$;
revoke execute on function private.audit_role_change() from public, anon, authenticated;
create trigger profiles_role_audit before update on public.profiles
for each row execute function private.audit_role_change();

create function private.audit_setting_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_by := (select auth.uid());
  new.updated_at := now();
  insert into public.audit_log (actor, action, subject, detail)
  values ((select auth.uid()), 'setting_changed', 'two_person_rule', jsonb_build_object('from', old.two_person_rule, 'to', new.two_person_rule));
  return new;
end;
$$;
revoke execute on function private.audit_setting_change() from public, anon, authenticated;
create trigger app_settings_audit before update on public.app_settings
for each row execute function private.audit_setting_change();

create function private.audit_hold_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (actor, action, subject, detail)
  values (new.requested_by, 'release_requested', new.change_id, jsonb_build_object('note', new.note));
  return new;
end;
$$;
revoke execute on function private.audit_hold_request() from public, anon, authenticated;
create trigger hold_requests_audit after insert on public.hold_requests
for each row execute function private.audit_hold_request();
