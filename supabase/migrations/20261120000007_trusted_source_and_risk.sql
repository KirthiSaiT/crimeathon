-- Trust the source address only when the gateway says so, and score every call against the key's own history.
--
-- Before this, public.sim_api took the caller's source address as an argument, and anyone holding the public key
-- could call it directly and claim any address, including a private one. Now the real gateway lives in the private
-- schema. The public function accepts a source address only when the caller also presents the gateway secret, which
-- only the web route holds. A direct call is treated as coming from an unknown address, so an address limit refuses it.
-- The route also reports a forged address (a private address claimed by a request that arrived from the public side).
--
-- The gateway secret is never stored here, only its SHA-256 hash. Register yours once with:
--   select private.register_gateway_hash('<sha256 hex of your GATEWAY_SECRET>');

-- 1. The gateway secret (hash only).
create table private.gateway (
  id boolean primary key default true check (id),
  secret_hash text not null
);
create function private.register_gateway_hash(p_hash text) returns void
language sql set search_path = '' as $$
  insert into private.gateway (id, secret_hash) values (true, lower(p_hash))
  on conflict (id) do update set secret_hash = excluded.secret_hash;
$$;
create function private.is_gateway(p_secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_secret, '') <> '' and exists (
    select 1 from private.gateway where secret_hash = encode(sha256(convert_to(p_secret, 'utf8')), 'hex')
  );
$$;
revoke execute on function private.register_gateway_hash(text), private.is_gateway(text) from public, anon, authenticated;

-- 2. What each call was judged to be.
alter table public.key_events add column risk integer, add column decision text, add column reasons text[];
grant select (risk, decision, reasons) on public.key_events to authenticated;

-- 3. The existing gateway becomes private. Nothing outside the database can call it with a claimed address.
alter function public.sim_api(text, text, text, jsonb, inet) set schema private;
alter function private.sim_api(text, text, text, jsonb, inet) rename to sim_gateway;
revoke execute on function private.sim_gateway(text, text, text, jsonb, inet) from public, anon, authenticated;

-- The scripted attack replay runs inside the database, so it may call the private gateway with its own addresses.
do $$
declare def text := pg_get_functiondef('public.run_attack_replay()'::regprocedure);
begin
  execute replace(def, 'public.sim_api(', 'private.sim_gateway(');
end $$;

-- 4. The public gateway: trusted source only with the secret, a forged address is blocked, and every call is scored.
create function public.sim_api(
  p_system text, p_secret text, p_action text, p_params jsonb default '{}'::jsonb,
  p_source inet default null, p_gateway text default null, p_forged boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  trusted boolean := private.is_gateway(p_gateway);
  src inet := case when trusted then p_source end;
  h text := private.hash_secret(coalesce(p_secret, ''));
  k public.managed_keys;
  have boolean;
  r jsonb;
  v_reasons text[] := '{}';
  score integer := 0;
  prior integer := 0;
  seen_src integer := 0;
  n_src integer := 0;
  burst integer := 0;
  used_action boolean := false;
  policy text;
  v_decision text;
  last_id bigint;
begin
  select * into k from public.managed_keys where system = p_system and (current_hash = h or previous_hash = h) limit 1;
  have := found;

  -- A private address claimed by a request that came in from the public side is a forgery, not a user.
  if trusted and p_forged then
    if have and k.status <> 'revoked' then
      perform private.log_event(k.id, k.name, p_system, p_action, 'refused', 'forged address: a private address was claimed from the public internet', left(coalesce(p_secret, ''), 14), null, null, true);
      perform private.contain(k, 'a forged source address', null, p_action);
    else
      perform private.log_event(null, null, p_system, p_action, 'refused', 'forged address: a private address was claimed from the public internet', left(coalesce(p_secret, ''), 14), null, null, true);
    end if;
    return jsonb_build_object('status', 403, 'ok', false, 'decision', 'BLOCKED', 'policy', 'ADDRESS-FORGED', 'risk', 100,
      'reasons', jsonb_build_array('A private address was claimed by a request that arrived from the public internet'),
      'reason', 'forged address: a private address cannot come from the public internet');
  end if;

  -- The key's own history, before this call is logged.
  if have then
    select count(*) into prior from public.key_events where key_id = k.id and outcome = 'accepted';
    select count(*) into burst from public.key_events where key_id = k.id and outcome in ('accepted', 'refused', 'held', 'flagged') and at > now() - interval '60 seconds';
    select count(distinct source_ip) into n_src from public.key_events where key_id = k.id and outcome = 'accepted' and source_ip is not null;
    if src is not null then select count(*) into seen_src from public.key_events where key_id = k.id and outcome = 'accepted' and source_ip = src; end if;
    select exists (select 1 from public.key_events where key_id = k.id and outcome = 'accepted' and action = p_action) into used_action;
  end if;

  r := private.sim_gateway(p_system, p_secret, p_action, p_params, src);

  if have and (r ->> 'status')::int = 200 then
    if prior >= 5 then
      if src is not null and seen_src = 0 then score := score + 35; v_reasons := v_reasons || format('First call from %s; this key has used %s other address(es)', host(src), n_src); end if;
      if not used_action then score := score + 25; v_reasons := v_reasons || format('New action: this key has never done %s', p_action); end if;
    end if;
    if burst >= 20 then score := score + 30; v_reasons := v_reasons || format('Unusual volume: %s calls in the last minute', burst); end if;
    if coalesce((r ->> 'flagged')::boolean, false) then score := score + 40; v_reasons := v_reasons || text 'Outside the key''s allowed address range (monitor mode, so it was allowed)'; end if;
    if src is null and k.range_mode <> 'off' then score := score + 40; v_reasons := v_reasons || text 'No trusted source address, so the address limit could not be checked'; end if;
    if prior < 5 and cardinality(v_reasons) = 0 then v_reasons := v_reasons || format('Not enough history yet (%s calls) to judge what is unusual', prior); end if;
  end if;

  policy := case
    when (r ->> 'status')::int = 202 then 'BANK-CHANGE-NEEDS-PEOPLE'
    when (r ->> 'status')::int < 400 then null
    when r ->> 'reason' like 'address:%' then 'ADDRESS-LIMIT'
    when r ->> 'reason' like 'scope:%' then 'KEY-SCOPE'
    when r ->> 'reason' like 'quarantined:%' then 'QUARANTINE-READ-ONLY'
    when r ->> 'reason' like '%revoked%' or r ->> 'reason' like '%expired%' or r ->> 'reason' like '%unknown key%' or r ->> 'reason' like 'rotated out%' then 'KEY-INVALID'
    else 'REQUEST-REFUSED' end;
  v_decision := case
    when (r ->> 'status')::int >= 400 or (r ->> 'status')::int = 202 then 'BLOCKED'
    when score >= 30 then 'SUSPICIOUS'
    else 'ALLOWED' end;
  if v_decision = 'BLOCKED' and cardinality(v_reasons) = 0 then v_reasons := array[coalesce(r ->> 'reason', 'refused')]; end if;
  if v_decision = 'ALLOWED' and cardinality(v_reasons) = 0 then v_reasons := array['Matches what this key normally does']; end if;

  -- Write the verdict onto the event the gateway just logged for this key.
  if have then
    select id into last_id from public.key_events where key_id = k.id and outcome in ('accepted', 'refused', 'held', 'flagged') order by id desc limit 1;
    if last_id is not null then
      update public.key_events set risk = case when v_decision = 'BLOCKED' then 100 else least(score, 100) end, decision = v_decision, reasons = v_reasons where id = last_id;
    end if;
  end if;

  return r || jsonb_build_object(
    'decision', v_decision, 'policy', policy, 'risk', case when v_decision = 'BLOCKED' then 100 else least(score, 100) end, 'reasons', to_jsonb(v_reasons),
    'recommend', case when v_decision = 'SUSPICIOUS' and score >= 60 then 'quarantine this key and rotate it' when v_decision = 'SUSPICIOUS' then 'watch this key' end,
    'trusted_source', trusted);
end;
$$;
revoke execute on function public.sim_api(text, text, text, jsonb, inet, text, boolean) from public;
grant execute on function public.sim_api(text, text, text, jsonb, inet, text, boolean) to anon, authenticated;
