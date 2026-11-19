-- Key vault: managed keys for three simulated systems (LedgerOne, HelpDeskr, BlueVault) that rotate on a
-- timer an administrator sets, with a grace window, a read-only quarantine, an activity log and a tiny
-- simulated API (public.sim_api) that checks a key the way a real gateway would.
-- Everything here is a simulation: the systems hold made-up data and nothing leaves this database.
-- Secrets are stored in private.key_secrets, which the API does not expose; a real deployment would use a
-- hardware-backed vault. Only hashes are kept in public.managed_keys, and those columns are not readable by clients.

insert into public.role_permissions (role, permission) values
  ('admin', 'manage_keys'), ('admin', 'quarantine_key'), ('analyst', 'quarantine_key'), ('approver', 'quarantine_key');

create table public.managed_keys (
  id uuid primary key default gen_random_uuid(),
  system text not null check (system in ('ledgerone', 'helpdeskr', 'bluevault')),
  name text not null check (char_length(name) between 2 and 60),
  scope text[] not null check (cardinality(scope) > 0),
  status text not null default 'active' check (status in ('active', 'quarantined', 'revoked')),
  rotation_seconds integer not null check (rotation_seconds between 60 and 86400),
  grace_seconds integer not null default 15 check (grace_seconds between 0 and 600),
  auto_rotate boolean not null default true,
  prefix text not null,
  current_hash text not null,
  previous_hash text,
  previous_valid_until timestamptz,
  version integer not null default 0,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now(),
  expires_at timestamptz not null default now()
);
create index managed_keys_created_by_idx on public.managed_keys (created_by);
create index managed_keys_current_hash_idx on public.managed_keys (current_hash);
create index managed_keys_previous_hash_idx on public.managed_keys (previous_hash);

create table private.key_secrets (
  key_id uuid primary key references public.managed_keys (id) on delete cascade,
  secret text not null
);

create table public.key_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  key_id uuid references public.managed_keys (id) on delete set null,
  key_name text,
  system text,
  action text,
  outcome text not null check (outcome in ('accepted', 'refused', 'created', 'rotated', 'quarantined', 'released', 'revoked', 'revealed', 'timing_changed')),
  reason text,
  secret_prefix text,
  actor uuid references auth.users (id) on delete set null
);
create index key_events_key_id_idx on public.key_events (key_id);
create index key_events_actor_idx on public.key_events (actor);
create index key_events_at_idx on public.key_events (at desc);

-- The made-up systems' data. Nothing reads these tables directly: only sim_api does.
create table public.sim_vendors (id text primary key, name text not null, bank_last4 text not null);
create table public.sim_tickets (id bigint generated always as identity primary key, subject text not null, created_at timestamptz not null default now());
create table public.sim_files (id text primary key, folder text not null, name text not null, content text not null);

insert into public.sim_vendors (id, name, bank_last4) values
  ('V-0412', 'Coastal Packaging Ltd', '4417'), ('V-0233', 'Southern Fuel Services', '3903'),
  ('V-0101', 'Apex Logistics Supply', '1120'), ('V-0244', 'Gemini Logistics Supply', '7788');
insert into public.sim_tickets (subject) values
  ('Customer cannot pull delivery proofs'), ('Invoice portal login loop'), ('Driver app shows wrong depot'), ('Request to update billing contact');
insert into public.sim_files (id, folder, name, content) values
  ('F-01', 'Finance', 'ap-ageing-q3.xlsx', 'synthetic: accounts payable ageing'), ('F-02', 'Finance', 'vendor-bank-list.csv', 'synthetic: vendor bank list'),
  ('F-03', 'Operations', 'depot-roster.csv', 'synthetic: depot roster'), ('F-04', 'Customers', 'delivery-proofs.zip', 'synthetic: delivery proofs');

revoke all on public.managed_keys, public.key_events, public.sim_vendors, public.sim_tickets, public.sim_files from anon, authenticated;
grant select (id, system, name, scope, status, rotation_seconds, grace_seconds, auto_rotate, prefix, version, created_at, rotated_at, expires_at)
  on public.managed_keys to authenticated;
grant select on public.key_events to authenticated;
alter table public.managed_keys enable row level security;
alter table public.key_events enable row level security;
alter table public.sim_vendors enable row level security;
alter table public.sim_tickets enable row level security;
alter table public.sim_files enable row level security;
create policy "read managed keys" on public.managed_keys for select to authenticated using ((select private.has_permission('view_case')));
create policy "read key events" on public.key_events for select to authenticated using ((select private.has_permission('view_case')));

create function private.valid_actions(p_system text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_system
    when 'ledgerone' then array['vendors.read', 'vendors.bank.read', 'vendors.bank.write']
    when 'helpdeskr' then array['tickets.read', 'tickets.write']
    when 'bluevault' then array['files.list', 'files.read']
    else array[]::text[] end;
$$;

create function private.hash_secret(s text) returns text
language sql immutable set search_path = '' as $$ select encode(extensions.digest(s, 'sha256'), 'hex'); $$;

create function private.log_event(p_key uuid, p_name text, p_system text, p_action text, p_outcome text, p_reason text, p_prefix text, p_actor uuid)
returns void language sql set search_path = '' as $$
  insert into public.key_events (key_id, key_name, system, action, outcome, reason, secret_prefix, actor)
  values (p_key, p_name, p_system, p_action, p_outcome, p_reason, p_prefix, p_actor);
$$;

-- Replace a key's secret. The old secret keeps working for grace_seconds so a consumer can pick up the new one.
create function private.rotate_key(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare k public.managed_keys; s text;
begin
  select * into k from public.managed_keys where id = p_id for update;
  if not found then raise exception 'No such key.'; end if;
  s := 'wk_' || k.system || '_' || encode(extensions.gen_random_bytes(18), 'hex');
  update public.managed_keys set
    previous_hash = case when k.version > 0 then k.current_hash else null end,
    previous_valid_until = case when k.version > 0 then now() + make_interval(secs => k.grace_seconds) else null end,
    current_hash = private.hash_secret(s),
    prefix = left(s, 14),
    version = k.version + 1,
    rotated_at = now(),
    expires_at = now() + make_interval(secs => k.rotation_seconds)
  where id = p_id;
  insert into private.key_secrets (key_id, secret) values (p_id, s)
    on conflict (key_id) do update set secret = excluded.secret;
  perform private.log_event(p_id, k.name, k.system, null, 'rotated', 'version ' || (k.version + 1), left(s, 14), (select auth.uid()));
  return s;
end;
$$;

create function private.rotate_due() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in select id from public.managed_keys where status <> 'revoked' and auto_rotate and version > 0 and expires_at <= now() for update skip locked loop
    perform private.rotate_key(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

create function public.rotate_due_keys() returns integer
language sql security definer set search_path = '' as $$ select private.rotate_due(); $$;

create function public.create_managed_key(p_system text, p_name text, p_scope text[], p_rotation_seconds integer, p_grace_seconds integer, p_auto_rotate boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare new_id uuid; s text;
begin
  if not (select private.has_permission('manage_keys')) then raise exception 'Your role does not allow this.'; end if;
  if not (p_scope <@ private.valid_actions(p_system)) or cardinality(p_scope) = 0 then raise exception 'That scope is not valid for %.', p_system; end if;
  insert into public.managed_keys (system, name, scope, rotation_seconds, grace_seconds, auto_rotate, prefix, current_hash)
  values (p_system, p_name, p_scope, p_rotation_seconds, p_grace_seconds, p_auto_rotate, '', '') returning id into new_id;
  s := private.rotate_key(new_id);
  perform private.log_event(new_id, p_name, p_system, null, 'created', 'rotates every ' || p_rotation_seconds || ' seconds', left(s, 14), (select auth.uid()));
  return s;
end;
$$;

create function public.rotate_managed_key(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.has_permission('manage_keys')) then raise exception 'Your role does not allow this.'; end if;
  if (select status from public.managed_keys where id = p_id) = 'revoked' then raise exception 'A revoked key cannot be rotated.'; end if;
  return private.rotate_key(p_id);
end;
$$;

create function public.set_managed_key_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare k public.managed_keys;
begin
  select * into k from public.managed_keys where id = p_id for update;
  if not found then raise exception 'No such key.'; end if;
  if k.status = 'revoked' then raise exception 'A revoked key stays revoked.'; end if;
  if p_status = 'revoked' then
    if not (select private.has_permission('manage_keys')) then raise exception 'Your role does not allow this.'; end if;
  elsif p_status in ('active', 'quarantined') then
    if not ((select private.has_permission('quarantine_key')) or (select private.has_permission('manage_keys'))) then raise exception 'Your role does not allow this.'; end if;
  else
    raise exception 'Unknown status.';
  end if;
  update public.managed_keys set status = p_status where id = p_id;
  perform private.log_event(p_id, k.name, k.system, null, case p_status when 'revoked' then 'revoked' when 'quarantined' then 'quarantined' else 'released' end, null, k.prefix, (select auth.uid()));
end;
$$;

create function public.update_managed_key_timing(p_id uuid, p_rotation_seconds integer, p_grace_seconds integer, p_auto_rotate boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare k public.managed_keys;
begin
  if not (select private.has_permission('manage_keys')) then raise exception 'Your role does not allow this.'; end if;
  select * into k from public.managed_keys where id = p_id for update;
  if not found then raise exception 'No such key.'; end if;
  update public.managed_keys set
    rotation_seconds = p_rotation_seconds, grace_seconds = p_grace_seconds, auto_rotate = p_auto_rotate,
    expires_at = k.rotated_at + make_interval(secs => p_rotation_seconds)
  where id = p_id;
  perform private.log_event(p_id, k.name, k.system, null, 'timing_changed', 'every ' || p_rotation_seconds || ' s, grace ' || p_grace_seconds || ' s, ' || case when p_auto_rotate then 'auto-rotate' else 'expires without rotating' end, k.prefix, (select auth.uid()));
end;
$$;

create function public.reveal_managed_key_secret(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare k public.managed_keys; s text;
begin
  if not (select private.has_permission('manage_keys')) then raise exception 'Your role does not allow this.'; end if;
  select * into k from public.managed_keys where id = p_id;
  if not found then raise exception 'No such key.'; end if;
  select secret into s from private.key_secrets where key_id = p_id;
  perform private.log_event(p_id, k.name, k.system, null, 'revealed', 'the current secret was shown to an administrator', k.prefix, (select auth.uid()));
  return s;
end;
$$;

create function public.reset_sim_data() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.has_permission('manage_keys')) then raise exception 'Your role does not allow this.'; end if;
  update public.sim_vendors set bank_last4 = case id when 'V-0412' then '4417' when 'V-0233' then '3903' when 'V-0101' then '1120' else '7788' end;
  delete from public.sim_tickets where id > 4;
end;
$$;

-- The simulated gateway: presents a secret and an action, gets back what a real API would answer.
-- It is callable without signing in on purpose, as a real API is; the secret is the credential.
create function public.sim_api(p_system text, p_secret text, p_action text, p_params jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  k public.managed_keys;
  h text := private.hash_secret(coalesce(p_secret, ''));
  pfx text := left(coalesce(p_secret, ''), 14);
  via_grace boolean := false;
  res jsonb;
  changed integer;
begin
  perform private.rotate_due();
  select * into k from public.managed_keys where system = p_system and current_hash = h;
  if not found then
    select * into k from public.managed_keys where system = p_system and previous_hash = h and previous_valid_until > now();
    if found then
      via_grace := true;
    else
      if exists (select 1 from public.managed_keys where system = p_system and previous_hash = h) then
        perform private.log_event(null, null, p_system, p_action, 'refused', 'rotated out: this secret was replaced', pfx, null);
        return jsonb_build_object('status', 401, 'ok', false, 'reason', 'rotated out: this secret was replaced by a newer one');
      end if;
      perform private.log_event(null, null, p_system, p_action, 'refused', 'unknown key', pfx, null);
      return jsonb_build_object('status', 401, 'ok', false, 'reason', 'unknown key');
    end if;
  end if;

  if k.status = 'revoked' then
    perform private.log_event(k.id, k.name, p_system, p_action, 'refused', 'revoked', pfx, null);
    return jsonb_build_object('status', 401, 'ok', false, 'reason', 'this key was revoked');
  end if;
  if not via_grace and k.expires_at <= now() then
    perform private.log_event(k.id, k.name, p_system, p_action, 'refused', 'expired', pfx, null);
    return jsonb_build_object('status', 401, 'ok', false, 'reason', 'this key has expired');
  end if;
  if not (p_action = any (k.scope)) then
    perform private.log_event(k.id, k.name, p_system, p_action, 'refused', 'scope: not allowed', pfx, null);
    return jsonb_build_object('status', 403, 'ok', false, 'reason', 'scope: this key is not allowed to do ' || coalesce(p_action, 'that'));
  end if;
  if k.status = 'quarantined' and p_action like '%.write' then
    perform private.log_event(k.id, k.name, p_system, p_action, 'refused', 'quarantined: read only', pfx, null);
    return jsonb_build_object('status', 403, 'ok', false, 'reason', 'quarantined: this key is read only');
  end if;

  if p_action = 'vendors.read' then
    res := (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by id), '[]'::jsonb) from public.sim_vendors);
  elsif p_action = 'vendors.bank.read' then
    res := (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'bank_last4', bank_last4) order by id), '[]'::jsonb) from public.sim_vendors);
  elsif p_action = 'vendors.bank.write' then
    update public.sim_vendors set bank_last4 = left(regexp_replace(coalesce(p_params ->> 'last4', ''), '[^0-9]', '', 'g'), 4) where id = p_params ->> 'vendor_id' and char_length(regexp_replace(coalesce(p_params ->> 'last4', ''), '[^0-9]', '', 'g')) >= 4;
    get diagnostics changed = row_count;
    res := jsonb_build_object('updated', changed);
  elsif p_action = 'tickets.read' then
    res := (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'subject', subject) order by id), '[]'::jsonb) from public.sim_tickets);
  elsif p_action = 'tickets.write' then
    insert into public.sim_tickets (subject) values (left(coalesce(nullif(p_params ->> 'subject', ''), 'Untitled ticket'), 120));
    res := jsonb_build_object('created', 1);
  elsif p_action = 'files.list' then
    res := (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'folder', folder, 'name', name) order by id), '[]'::jsonb) from public.sim_files);
  elsif p_action = 'files.read' then
    res := (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'content', content)), '[]'::jsonb) from public.sim_files where id = p_params ->> 'id');
  else
    perform private.log_event(k.id, k.name, p_system, p_action, 'refused', 'unknown action', pfx, null);
    return jsonb_build_object('status', 400, 'ok', false, 'reason', 'unknown action');
  end if;

  perform private.log_event(k.id, k.name, p_system, p_action, 'accepted', case when via_grace then 'accepted inside the grace window of the previous secret' else null end, pfx, null);
  return jsonb_build_object('status', 200, 'ok', true, 'data', res, 'grace', via_grace);
end;
$$;

-- Functions are not callable by default; grant exactly what each one needs.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.sim_api(text, text, text, jsonb) to anon, authenticated;
grant execute on function public.rotate_due_keys() to authenticated;
grant execute on function public.create_managed_key(text, text, text[], integer, integer, boolean) to authenticated;
grant execute on function public.rotate_managed_key(uuid) to authenticated;
grant execute on function public.set_managed_key_status(uuid, text) to authenticated;
grant execute on function public.update_managed_key_timing(uuid, integer, integer, boolean) to authenticated;
grant execute on function public.reveal_managed_key_secret(uuid) to authenticated;
grant execute on function public.reset_sim_data() to authenticated;
revoke execute on function private.rotate_key(uuid), private.rotate_due(), private.log_event(uuid, text, text, text, text, text, text, uuid), private.hash_secret(text), private.valid_actions(text) from public, anon, authenticated;
