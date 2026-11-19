-- Guard the money: address limits per key, automatic cut-off on a critical event, split a broad key into
-- narrow ones, bank changes made through a key that are held instead of applied, and a scripted attack replay.
-- Everything is a simulation inside this database; the simulated systems hold made-up data.

-- 1. Address limits and containment settings on a key.
alter table public.managed_keys
  add column allowed_ranges cidr[] not null default '{}',
  add column range_mode text not null default 'off' check (range_mode in ('off', 'monitor', 'enforce')),
  add column on_critical text not null default 'quarantine' check (on_critical in ('none', 'quarantine', 'revoke')),
  add column parent_id uuid references public.managed_keys (id) on delete set null;
create index managed_keys_parent_idx on public.managed_keys (parent_id);
grant select (allowed_ranges, range_mode, on_critical, parent_id) on public.managed_keys to authenticated;

alter table public.key_events add column source_ip inet, add column critical boolean not null default false;
alter table public.key_events drop constraint key_events_outcome_check;
alter table public.key_events add constraint key_events_outcome_check check (outcome in (
  'accepted', 'refused', 'created', 'rotated', 'quarantined', 'released', 'revoked', 'revealed', 'timing_changed',
  'flagged', 'contained', 'held', 'split', 'settings_changed'));

alter table public.key_actions drop constraint key_actions_action_check;
alter table public.key_actions add constraint key_actions_action_check check (action in ('suspend', 'quarantine', 'rotate', 'set_expiry', 'narrow_scope', 'set_range'));

-- 2. Simulated LedgerOne: a bank change made through a key waits to be released by people.
alter table public.sim_vendors add column contact_phone text not null default '';

create table public.sim_contact_changes (
  id bigint generated always as identity primary key,
  vendor_id text not null references public.sim_vendors (id) on delete cascade,
  changed_at timestamptz not null default now(),
  key_id uuid references public.managed_keys (id) on delete set null
);
create index sim_contact_changes_vendor_idx on public.sim_contact_changes (vendor_id);
create index sim_contact_changes_key_idx on public.sim_contact_changes (key_id);

create table public.sim_pending_changes (
  id uuid primary key default gen_random_uuid(),
  vendor_id text not null references public.sim_vendors (id) on delete cascade,
  old_last4 text not null,
  new_last4 text not null,
  requested_by_key uuid references public.managed_keys (id) on delete set null,
  key_name text,
  source_ip inet,
  contact_recent boolean not null default false,
  status text not null default 'held' check (status in ('held', 'released', 'rejected')),
  created_at timestamptz not null default now(),
  release_requested_by uuid references auth.users (id) on delete set null,
  release_requested_at timestamptz,
  release_note text,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz
);
create index sim_pending_vendor_idx on public.sim_pending_changes (vendor_id);
create index sim_pending_key_idx on public.sim_pending_changes (requested_by_key);
create index sim_pending_requester_idx on public.sim_pending_changes (release_requested_by);
create index sim_pending_decider_idx on public.sim_pending_changes (decided_by);

revoke all on public.sim_contact_changes, public.sim_pending_changes from anon, authenticated;
grant select on public.sim_pending_changes to authenticated;
alter table public.sim_contact_changes enable row level security;
alter table public.sim_pending_changes enable row level security;
create policy "read pending changes" on public.sim_pending_changes for select to authenticated using ((select private.has_permission('view_case')));

create or replace function private.valid_actions(p_system text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_system
    when 'ledgerone' then array['vendors.read', 'vendors.bank.read', 'vendors.bank.write', 'vendors.contact.write']
    when 'helpdeskr' then array['tickets.read', 'tickets.write']
    when 'bluevault' then array['files.list', 'files.read']
    else array[]::text[] end;
$$;

-- 3. Logging with a source address and a critical flag.
drop function private.log_event(uuid, text, text, text, text, text, text, uuid);
create function private.log_event(p_key uuid, p_name text, p_system text, p_action text, p_outcome text, p_reason text, p_prefix text, p_actor uuid, p_source inet default null, p_critical boolean default false)
returns void language sql set search_path = '' as $$
  insert into public.key_events (key_id, key_name, system, action, outcome, reason, secret_prefix, actor, source_ip, critical)
  values (p_key, p_name, p_system, p_action, p_outcome, p_reason, p_prefix, p_actor, p_source, p_critical);
$$;

-- Automatic cut-off: what happens to a key after a critical event, as its owner chose.
create function private.contain(k public.managed_keys, p_reason text, p_source inet, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if k.on_critical = 'quarantine' and k.status = 'active' then
    update public.managed_keys set status = 'quarantined' where id = k.id;
    perform private.log_event(k.id, k.name, k.system, p_action, 'contained', 'automatic cut-off: quarantined (read only) after ' || p_reason, k.prefix, null, p_source, true);
  elsif k.on_critical = 'revoke' and k.status <> 'revoked' then
    update public.managed_keys set status = 'revoked' where id = k.id;
    perform private.log_event(k.id, k.name, k.system, p_action, 'contained', 'automatic cut-off: revoked after ' || p_reason, k.prefix, null, p_source, true);
  end if;
end;
$$;

-- 4. Creating keys, now with address limits, shared by the admin function, split and replay.
create function private.make_key(p_system text, p_name text, p_scope text[], p_rotation integer, p_grace integer, p_auto boolean, p_ranges text[], p_mode text, p_on_critical text, p_parent uuid)
returns table (out_id uuid, out_secret text) language plpgsql security definer set search_path = '' as $$
declare new_id uuid; s text;
begin
  if cardinality(p_scope) = 0 or not (p_scope <@ private.valid_actions(p_system)) then raise exception 'That scope is not valid for %.', p_system; end if;
  if p_mode in ('monitor', 'enforce') and cardinality(coalesce(p_ranges, '{}')) = 0 then raise exception 'Add at least one address range, or switch the address limit off.'; end if;
  insert into public.managed_keys (system, name, scope, rotation_seconds, grace_seconds, auto_rotate, allowed_ranges, range_mode, on_critical, parent_id, prefix, current_hash)
  values (p_system, p_name, p_scope, p_rotation, p_grace, p_auto, coalesce(p_ranges, '{}')::cidr[], p_mode, p_on_critical, p_parent, '', '') returning id into new_id;
  s := private.rotate_key(new_id);
  perform private.log_event(new_id, p_name, p_system, null, 'created', 'rotates every ' || p_rotation || ' seconds' || case when p_mode <> 'off' then ', address limit ' || p_mode else '' end, left(s, 14), (select auth.uid()));
  out_id := new_id;
  out_secret := s;
  return next;
end;
$$;

drop function public.create_managed_key(text, text, text[], integer, integer, boolean);
create function public.create_managed_key(p_system text, p_name text, p_scope text[], p_rotation_seconds integer, p_grace_seconds integer, p_auto_rotate boolean, p_ranges text[] default '{}', p_range_mode text default 'off', p_on_critical text default 'quarantine')
returns text language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if not (select private.has_permission('manage_keys')) then raise exception 'Your role does not allow this.'; end if;
  select * into r from private.make_key(p_system, p_name, p_scope, p_rotation_seconds, p_grace_seconds, p_auto_rotate, p_ranges, p_range_mode, p_on_critical, null);
  return r.out_secret;
end;
$$;

create function public.update_managed_key_guard(p_id uuid, p_ranges text[], p_range_mode text, p_on_critical text) returns void
language plpgsql security definer set search_path = '' as $$
declare k public.managed_keys;
begin
  if not (select private.has_permission('manage_keys')) then raise exception 'Your role does not allow this.'; end if;
  if p_range_mode in ('monitor', 'enforce') and cardinality(coalesce(p_ranges, '{}')) = 0 then raise exception 'Add at least one address range, or switch the address limit off.'; end if;
  select * into k from public.managed_keys where id = p_id for update;
  if not found then raise exception 'No such key.'; end if;
  update public.managed_keys set allowed_ranges = coalesce(p_ranges, '{}')::cidr[], range_mode = p_range_mode, on_critical = p_on_critical where id = p_id;
  perform private.log_event(p_id, k.name, k.system, null, 'settings_changed', 'address limit ' || p_range_mode || coalesce(' ' || array_to_string(p_ranges, ', '), '') || ', on a critical event: ' || p_on_critical, k.prefix, (select auth.uid()));
end;
$$;

-- Addresses a key has actually been used from, so the range can be proposed from behaviour.
create function public.suggest_key_ranges(p_id uuid) returns text[]
language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.has_permission('manage_keys')) then raise exception 'Your role does not allow this.'; end if;
  return coalesce((select array_agg(distinct host(source_ip) order by host(source_ip)) from public.key_events where key_id = p_id and source_ip is not null and outcome = 'accepted'), '{}');
end;
$$;

-- Split one broad key into narrow ones, built from what it was actually used for.
create function public.split_managed_key(p_id uuid, p_retire boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k public.managed_keys; reads text[]; writes text[]; w text; r record; made jsonb := '[]'::jsonb; ranges text[]; nm text;
begin
  if not (select private.has_permission('manage_keys')) then raise exception 'Your role does not allow this.'; end if;
  select * into k from public.managed_keys where id = p_id for update;
  if not found then raise exception 'No such key.'; end if;
  if k.status = 'revoked' then raise exception 'A revoked key cannot be split.'; end if;
  select array_agg(distinct action) filter (where action not like '%.write'), array_agg(distinct action) filter (where action like '%.write' and action <> 'vendors.bank.write')
    into reads, writes from public.key_events where key_id = p_id and outcome = 'accepted' and action is not null;
  if reads is null and writes is null then raise exception 'Use the key first: a split is built from the actions it actually performed.'; end if;
  ranges := array(select a::text from unnest(k.allowed_ranges) a);
  if reads is not null then
    nm := left(k.name, 50) || '-read';
    select * into r from private.make_key(k.system, nm, reads, k.rotation_seconds, k.grace_seconds, k.auto_rotate, ranges, k.range_mode, k.on_critical, k.id);
    made := made || jsonb_build_array(jsonb_build_object('name', nm, 'scope', to_jsonb(reads), 'secret', r.out_secret));
  end if;
  foreach w in array coalesce(writes, '{}'::text[]) loop
    nm := left(k.name, 30) || '-' || replace(w, '.', '-');
    select * into r from private.make_key(k.system, nm, array[w], k.rotation_seconds, k.grace_seconds, k.auto_rotate, ranges, k.range_mode, k.on_critical, k.id);
    made := made || jsonb_build_array(jsonb_build_object('name', nm, 'scope', jsonb_build_array(w), 'secret', r.out_secret));
  end loop;
  perform private.log_event(p_id, k.name, k.system, null, 'split', 'split into ' || jsonb_array_length(made) || ' narrow keys from what it did; bank-account changes are never included', k.prefix, (select auth.uid()));
  if p_retire then
    update public.managed_keys set status = 'revoked' where id = p_id;
    perform private.log_event(p_id, k.name, k.system, null, 'revoked', 'retired after the split', k.prefix, (select auth.uid()));
  end if;
  return made;
end;
$$;

-- 5. The simulated gateway with address limits, automatic cut-off and held bank changes.
drop function public.sim_api(text, text, text, jsonb);
create function public.sim_api(p_system text, p_secret text, p_action text, p_params jsonb default '{}'::jsonb, p_source inet default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  k public.managed_keys;
  h text := private.hash_secret(coalesce(p_secret, ''));
  pfx text := left(coalesce(p_secret, ''), 14);
  via_grace boolean := false;
  res jsonb;
  changed integer;
  out_of_range boolean;
  flagged boolean := false;
  vid text;
  new4 text;
  recent boolean;
  old4 text;
  pid uuid;
  src text := coalesce(host(p_source), 'unknown');
  contained boolean;
begin
  perform private.rotate_due();
  select * into k from public.managed_keys where system = p_system and current_hash = h;
  if not found then
    select * into k from public.managed_keys where system = p_system and previous_hash = h and previous_valid_until > now();
    if found then
      via_grace := true;
    else
      if exists (select 1 from public.managed_keys where system = p_system and previous_hash = h) then
        perform private.log_event(null, null, p_system, p_action, 'refused', 'rotated out: this secret was replaced', pfx, null, p_source);
        return jsonb_build_object('status', 401, 'ok', false, 'reason', 'rotated out: this secret was replaced by a newer one');
      end if;
      perform private.log_event(null, null, p_system, p_action, 'refused', 'unknown key', pfx, null, p_source);
      return jsonb_build_object('status', 401, 'ok', false, 'reason', 'unknown key');
    end if;
  end if;

  if k.status = 'revoked' then
    perform private.log_event(k.id, k.name, p_system, p_action, 'refused', 'revoked', pfx, null, p_source);
    return jsonb_build_object('status', 401, 'ok', false, 'reason', 'this key was revoked');
  end if;
  if not via_grace and k.expires_at <= now() then
    perform private.log_event(k.id, k.name, p_system, p_action, 'refused', 'expired', pfx, null, p_source);
    return jsonb_build_object('status', 401, 'ok', false, 'reason', 'this key has expired');
  end if;

  -- Address limit. Monitor mode flags and allows; enforce mode refuses and cuts the key off.
  out_of_range := k.range_mode <> 'off' and cardinality(k.allowed_ranges) > 0 and (p_source is null or not (p_source <<= any (k.allowed_ranges)));
  if out_of_range then
    if k.range_mode = 'enforce' then
      perform private.log_event(k.id, k.name, p_system, p_action, 'refused', 'address: ' || src || ' is outside the allowed range', pfx, null, p_source, true);
      perform private.contain(k, 'a call from outside its address range', p_source, p_action);
      select status <> 'active' into contained from public.managed_keys where id = k.id;
      return jsonb_build_object('status', 403, 'ok', false, 'contained', contained, 'reason', 'address: ' || src || ' is outside the range this key may be used from');
    end if;
    flagged := true;
    perform private.log_event(k.id, k.name, p_system, p_action, 'flagged', 'address: ' || src || ' is outside the allowed range (monitor mode, so it was allowed)', pfx, null, p_source);
  end if;

  if not (p_action = any (k.scope)) then
    perform private.log_event(k.id, k.name, p_system, p_action, 'refused', 'scope: not allowed', pfx, null, p_source, true);
    perform private.contain(k, 'an action outside its permissions', p_source, p_action);
    select status <> 'active' into contained from public.managed_keys where id = k.id;
    return jsonb_build_object('status', 403, 'ok', false, 'contained', contained, 'reason', 'scope: this key is not allowed to do ' || coalesce(p_action, 'that'));
  end if;
  if k.status = 'quarantined' and p_action like '%.write' then
    perform private.log_event(k.id, k.name, p_system, p_action, 'refused', 'quarantined: read only', pfx, null, p_source, true);
    perform private.contain(k, 'a write while quarantined', p_source, p_action);
    return jsonb_build_object('status', 403, 'ok', false, 'reason', 'quarantined: this key is read only');
  end if;

  if p_action = 'vendors.read' then
    res := (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by id), '[]'::jsonb) from public.sim_vendors);
  elsif p_action = 'vendors.bank.read' then
    res := (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'bank_last4', bank_last4) order by id), '[]'::jsonb) from public.sim_vendors);
  elsif p_action = 'vendors.bank.write' then
    -- A key never changes a bank account. The change waits for a call-back and for people to release it.
    vid := p_params ->> 'vendor_id';
    new4 := left(regexp_replace(coalesce(p_params ->> 'last4', ''), '[^0-9]', '', 'g'), 4);
    select bank_last4 into old4 from public.sim_vendors where id = vid;
    if old4 is null or char_length(new4) < 4 then
      perform private.log_event(k.id, k.name, p_system, p_action, 'refused', 'a bank change needs a known vendor and four digits', pfx, null, p_source);
      return jsonb_build_object('status', 400, 'ok', false, 'reason', 'a bank change needs a known vendor_id and four digits in last4');
    end if;
    recent := exists (select 1 from public.sim_contact_changes c where c.vendor_id = vid and c.changed_at > now() - interval '14 days');
    insert into public.sim_pending_changes (vendor_id, old_last4, new_last4, requested_by_key, key_name, source_ip, contact_recent)
    values (vid, old4, new4, k.id, k.name, p_source, recent) returning id into pid;
    perform private.log_event(k.id, k.name, p_system, p_action, 'held', vid || ': bank change held for a call-back, not applied' || case when recent then '; the call-back contact changed in the last 14 days' else '' end, pfx, null, p_source, true);
    perform private.contain(k, 'a bank-account change attempt', p_source, p_action);
    select status <> 'active' into contained from public.managed_keys where id = k.id;
    return jsonb_build_object('status', 202, 'ok', true, 'pending', true, 'id', pid, 'contained', contained, 'contact_recent', recent,
      'reason', 'held: a key cannot change a bank account; it waits for a call-back and a second person');
  elsif p_action = 'vendors.contact.write' then
    update public.sim_vendors set contact_phone = left(coalesce(p_params ->> 'phone', ''), 30) where id = p_params ->> 'vendor_id';
    get diagnostics changed = row_count;
    if changed > 0 then insert into public.sim_contact_changes (vendor_id, key_id) values (p_params ->> 'vendor_id', k.id); end if;
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
    perform private.log_event(k.id, k.name, p_system, p_action, 'refused', 'unknown action', pfx, null, p_source);
    return jsonb_build_object('status', 400, 'ok', false, 'reason', 'unknown action');
  end if;

  perform private.log_event(k.id, k.name, p_system, p_action, 'accepted', case when via_grace then 'accepted inside the grace window of the previous secret' else null end, pfx, null, p_source);
  return jsonb_build_object('status', 200, 'ok', true, 'data', res, 'grace', via_grace, 'flagged', flagged);
end;
$$;

-- 6. People decide held bank changes. Asking and approving are different people.
create function public.request_sim_release(p_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.sim_pending_changes;
begin
  if not (select private.has_permission('request_release')) then raise exception 'Your role does not allow this.'; end if;
  select * into c from public.sim_pending_changes where id = p_id for update;
  if not found or c.status <> 'held' then raise exception 'That change is not waiting.'; end if;
  if c.release_requested_by is not null then raise exception 'A release was already requested.'; end if;
  update public.sim_pending_changes set release_requested_by = (select auth.uid()), release_requested_at = now(), release_note = left(p_note, 300) where id = p_id;
  insert into public.audit_log (actor, action, subject, detail) values ((select auth.uid()), 'release_requested', 'sim:' || c.vendor_id, jsonb_build_object('note', left(p_note, 300)));
end;
$$;

create function public.decide_sim_change(p_id uuid, p_release boolean, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.sim_pending_changes;
begin
  if not (select private.has_permission('release_hold')) then raise exception 'Your role does not allow this.'; end if;
  select * into c from public.sim_pending_changes where id = p_id for update;
  if not found or c.status <> 'held' then raise exception 'That change is not waiting.'; end if;
  if p_release then
    if (select two_person_rule from public.app_settings) and (c.release_requested_by is null or c.release_requested_by = (select auth.uid())) then
      raise exception 'A different person must request this release first.';
    end if;
    update public.sim_vendors set bank_last4 = c.new_last4 where id = c.vendor_id;
  end if;
  update public.sim_pending_changes set status = case when p_release then 'released' else 'rejected' end, decided_by = (select auth.uid()), decided_at = now(),
    release_note = coalesce(left(p_note, 300), release_note) where id = p_id;
  insert into public.audit_log (actor, action, subject, detail)
  values ((select auth.uid()), case when p_release then 'hold_released' else 'sim_change_rejected' end, 'sim:' || c.vendor_id, jsonb_build_object('note', left(p_note, 300)));
end;
$$;

create or replace function public.reset_sim_data() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.has_permission('manage_keys')) then raise exception 'Your role does not allow this.'; end if;
  delete from public.sim_pending_changes;
  delete from public.sim_contact_changes;
  update public.sim_vendors set contact_phone = '', bank_last4 = case id when 'V-0412' then '4417' when 'V-0233' then '3903' when 'V-0101' then '1120' else '7788' end;
  delete from public.sim_tickets where id > 4;
end;
$$;

-- 7. The scripted attack, run against fresh keys so the defences can be watched in order.
create function public.run_attack_replay() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  sfx text := to_char(clock_timestamp(), 'HH24MISS');
  a record; b record; r jsonb; steps jsonb := '[]'::jsonb; bank text;
begin
  if not (select private.has_permission('manage_keys')) then raise exception 'Your role does not allow this.'; end if;
  select * into a from private.make_key('ledgerone', 'replay-sync-' || sfx, array['vendors.read', 'vendors.bank.read'], 120, 0, true, array['10.20.4.0/28'], 'enforce', 'quarantine', null);
  select * into b from private.make_key('ledgerone', 'replay-ops-' || sfx, array['vendors.read', 'vendors.bank.read', 'vendors.bank.write'], 120, 0, true, array['10.20.4.0/24'], 'enforce', 'quarantine', null);

  r := public.sim_api('ledgerone', a.out_secret, 'vendors.read', '{}', '10.20.4.12');
  steps := steps || jsonb_build_array(jsonb_build_object('n', 1, 'title', 'The real sync computer reads vendors', 'ip', '10.20.4.12', 'action', 'vendors.read', 'status', r ->> 'status', 'result', coalesce(r ->> 'reason', 'accepted'), 'key', 'replay-sync-' || sfx, 'key_status', (select status from public.managed_keys where id = a.out_id)));
  r := public.sim_api('ledgerone', a.out_secret, 'vendors.bank.read', '{}', '198.18.7.41');
  steps := steps || jsonb_build_array(jsonb_build_object('n', 2, 'title', 'The same key, stolen, is used from a home-internet address', 'ip', '198.18.7.41', 'action', 'vendors.bank.read', 'status', r ->> 'status', 'result', coalesce(r ->> 'reason', 'accepted'), 'key', 'replay-sync-' || sfx, 'key_status', (select status from public.managed_keys where id = a.out_id)));
  r := public.sim_api('ledgerone', a.out_secret, 'vendors.read', '{}', '10.20.4.12');
  steps := steps || jsonb_build_array(jsonb_build_object('n', 3, 'title', 'After the cut-off the real computer can still read', 'ip', '10.20.4.12', 'action', 'vendors.read', 'status', r ->> 'status', 'result', coalesce(r ->> 'reason', 'accepted'), 'key', 'replay-sync-' || sfx, 'key_status', (select status from public.managed_keys where id = a.out_id)));
  r := public.sim_api('ledgerone', b.out_secret, 'vendors.bank.read', '{}', '10.20.4.77');
  steps := steps || jsonb_build_array(jsonb_build_object('n', 4, 'title', 'A second key has the loose vendor range 10.20.4.0/24, so the build computer gets in', 'ip', '10.20.4.77', 'action', 'vendors.bank.read', 'status', r ->> 'status', 'result', coalesce(r ->> 'reason', 'accepted'), 'key', 'replay-ops-' || sfx, 'key_status', (select status from public.managed_keys where id = b.out_id)));
  r := public.sim_api('ledgerone', b.out_secret, 'vendors.bank.write', '{"vendor_id":"V-0412","last4":"9083"}', '10.20.4.77');
  steps := steps || jsonb_build_array(jsonb_build_object('n', 5, 'title', 'It tries to change a supplier bank account', 'ip', '10.20.4.77', 'action', 'vendors.bank.write', 'status', r ->> 'status', 'result', coalesce(r ->> 'reason', 'accepted'), 'key', 'replay-ops-' || sfx, 'key_status', (select status from public.managed_keys where id = b.out_id)));
  r := public.sim_api('ledgerone', b.out_secret, 'vendors.bank.write', '{"vendor_id":"V-0233","last4":"1111"}', '10.20.4.77');
  steps := steps || jsonb_build_array(jsonb_build_object('n', 6, 'title', 'It tries again, now cut off', 'ip', '10.20.4.77', 'action', 'vendors.bank.write', 'status', r ->> 'status', 'result', coalesce(r ->> 'reason', 'accepted'), 'key', 'replay-ops-' || sfx, 'key_status', (select status from public.managed_keys where id = b.out_id)));

  select bank_last4 into bank from public.sim_vendors where id = 'V-0412';
  update public.managed_keys set status = 'revoked' where id in (a.out_id, b.out_id);
  perform private.log_event(a.out_id, 'replay-sync-' || sfx, 'ledgerone', null, 'revoked', 'replay finished', null, (select auth.uid()));
  perform private.log_event(b.out_id, 'replay-ops-' || sfx, 'ledgerone', null, 'revoked', 'replay finished', null, (select auth.uid()));
  return jsonb_build_object('steps', steps, 'bank_after', bank, 'held', (select count(*) from public.sim_pending_changes where status = 'held'));
end;
$$;

-- Grants: exactly what each function needs.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.sim_api(text, text, text, jsonb, inet) to anon, authenticated;
grant execute on function public.rotate_due_keys() to authenticated;
grant execute on function public.create_managed_key(text, text, text[], integer, integer, boolean, text[], text, text) to authenticated;
grant execute on function public.rotate_managed_key(uuid) to authenticated;
grant execute on function public.set_managed_key_status(uuid, text) to authenticated;
grant execute on function public.update_managed_key_timing(uuid, integer, integer, boolean) to authenticated;
grant execute on function public.update_managed_key_guard(uuid, text[], text, text) to authenticated;
grant execute on function public.reveal_managed_key_secret(uuid) to authenticated;
grant execute on function public.reset_sim_data() to authenticated;
grant execute on function public.suggest_key_ranges(uuid) to authenticated;
grant execute on function public.split_managed_key(uuid, boolean) to authenticated;
grant execute on function public.request_sim_release(uuid, text) to authenticated;
grant execute on function public.decide_sim_change(uuid, boolean, text) to authenticated;
grant execute on function public.run_attack_replay() to authenticated;
revoke execute on function private.contain(public.managed_keys, text, inet, text), private.make_key(text, text, text[], integer, integer, boolean, text[], text, text, uuid),
  private.log_event(uuid, text, text, text, text, text, text, uuid, inet, boolean) from public, anon, authenticated;
