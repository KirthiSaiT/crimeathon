-- Support tickets with a secret scanner. A ticket or comment that contains a secret is not saved, an
-- administrator is alerted, and a pasted vault key that is really live is rotated at once.
-- The scan runs inside the database, so the page cannot skip it. The secret itself is never stored:
-- an alert keeps only the kind of secret and a short redacted preview.

insert into public.role_permissions (role, permission) values
  ('viewer', 'raise_ticket'), ('analyst', 'raise_ticket'), ('approver', 'raise_ticket'), ('admin', 'raise_ticket'),
  ('admin', 'review_secret_alerts'), ('admin', 'override_secret_block');

create table public.support_tickets (
  id bigint generated always as identity (start with 49001) primary key,
  subject text not null check (char_length(subject) between 1 and 120),
  body text not null default '' check (char_length(body) <= 4000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  secret_masked boolean not null default false
);
create index support_tickets_created_by_idx on public.support_tickets (created_by);

create table public.ticket_comments (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references public.support_tickets (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  secret_masked boolean not null default false
);
create index ticket_comments_ticket_idx on public.ticket_comments (ticket_id);
create index ticket_comments_created_by_idx on public.ticket_comments (created_by);

create table public.secret_alerts (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid references auth.users (id) on delete set null,
  actor_email text,
  action text not null check (action in ('ticket.create', 'ticket.comment')),
  ticket_id bigint references public.support_tickets (id) on delete set null,
  patterns text[] not null,
  previews text[] not null,
  rotated_keys text[] not null default '{}',
  overridden boolean not null default false,
  override_reason text,
  status text not null default 'open' check (status in ('open', 'reviewed')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text
);
create index secret_alerts_actor_idx on public.secret_alerts (actor);
create index secret_alerts_ticket_idx on public.secret_alerts (ticket_id);
create index secret_alerts_reviewed_by_idx on public.secret_alerts (reviewed_by);
create index secret_alerts_open_idx on public.secret_alerts (at desc) where status = 'open';

revoke all on public.support_tickets, public.ticket_comments, public.secret_alerts from anon, authenticated;
grant select on public.support_tickets, public.ticket_comments, public.secret_alerts to authenticated;
alter table public.support_tickets enable row level security;
alter table public.ticket_comments enable row level security;
alter table public.secret_alerts enable row level security;
create policy "read tickets" on public.support_tickets for select to authenticated using ((select private.has_permission('view_case')));
create policy "read ticket comments" on public.ticket_comments for select to authenticated using ((select private.has_permission('view_case')));
create policy "admins read secret alerts" on public.secret_alerts for select to authenticated using ((select private.has_permission('review_secret_alerts')));

-- What looks like a secret. Patterns, not guesses about meaning: the vault check below tells a real key from a sample.
create function private.scan_secrets(p_text text) returns table (pattern text, hit text, preview text)
language sql immutable set search_path = '' as $$
  select 'vault key', m[1], left(m[1], 8) || '…' from regexp_matches(p_text, '(wk_(?:ledgerone|helpdeskr|bluevault)_[0-9a-f]{36})', 'g') as m
  union all
  select 'storage key', m[1], left(m[1], 6) || '…' from regexp_matches(p_text, '(\mbvk-[0-9a-f]{4,}\M)', 'g') as m
  union all
  select 'private key', m[1], '-----BEGIN…' from regexp_matches(p_text, '(-----BEGIN [A-Z ]*PRIVATE KEY-----)', 'g') as m
  union all
  select 'password or secret', m[1], regexp_replace(m[1], '[:=].*$', '=…') from regexp_matches(p_text, '((?:password|passwd|pwd|secret|api[_-]?key|access[_-]?key|auth[_-]?token|token)\s*[:=]\s*["'']?[^\s"'']{6,})', 'gi') as m
  union all
  select 'bearer token', m[1], 'Bearer …' from regexp_matches(p_text, '([Bb]earer\s+[A-Za-z0-9._~+/=-]{16,})', 'g') as m
  union all
  select 'JWT', m[1], left(m[1], 6) || '…' from regexp_matches(p_text, '(eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})', 'g') as m
  union all
  select 'cloud or service key', m[1], left(m[1], 6) || '…' from regexp_matches(p_text, '(AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|sb_secret_[A-Za-z0-9_-]{16,}|sk-[A-Za-z0-9]{20,})', 'g') as m
  union all
  select 'credentials in a link', m[1], regexp_replace(m[1], '://.*$', '://…') from regexp_matches(p_text, '([a-z][a-z0-9+.-]*://[^\s:@/]+:[^\s@/]{4,}@[^\s]+)', 'g') as m;
$$;

-- Screen a subject and body: scan, rotate any pasted key the vault confirms is live, write the alert,
-- and decide whether the text may be saved (never, unless a reviewer overrides, and then only masked).
create function private.screen(p_subject text, p_body text, p_action text, p_ticket bigint, p_override text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record; k public.managed_keys;
  pats text[] := '{}'; prevs text[] := '{}'; rotated text[] := '{}';
  subj text := coalesce(p_subject, ''); bd text := coalesce(p_body, '');
  overridden boolean; aid bigint; who text;
begin
  for r in select * from private.scan_secrets(coalesce(p_subject, '') || E'\n' || coalesce(p_body, '')) loop
    pats := pats || r.pattern;
    prevs := prevs || r.preview;
    subj := replace(subj, r.hit, '[secret removed]');
    bd := replace(bd, r.hit, '[secret removed]');
    if r.pattern = 'vault key' then
      select * into k from public.managed_keys where current_hash = private.hash_secret(r.hit) or previous_hash = private.hash_secret(r.hit) limit 1;
      if found and k.status <> 'revoked' then
        perform private.rotate_key(k.id);
        -- a leaked secret must stop working now, not after the grace window
        update public.managed_keys set previous_hash = null, previous_valid_until = null where id = k.id;
        rotated := rotated || k.name;
        perform private.log_event(k.id, k.name, k.system, null, 'flagged', 'leaked in a support ticket: the key was rotated at once', k.prefix, (select auth.uid()), null, true);
      end if;
    end if;
  end loop;
  if cardinality(pats) = 0 then
    return jsonb_build_object('blocked', false, 'masked', false, 'subject', coalesce(p_subject, ''), 'body', coalesce(p_body, ''));
  end if;
  overridden := p_override is not null and char_length(btrim(p_override)) >= 5 and (select private.has_permission('override_secret_block'));
  select email into who from public.profiles where id = (select auth.uid());
  insert into public.secret_alerts (actor, actor_email, action, ticket_id, patterns, previews, rotated_keys, overridden, override_reason)
  values ((select auth.uid()), who, p_action, p_ticket, pats, prevs, rotated, overridden, case when overridden then left(btrim(p_override), 300) end)
  returning id into aid;
  insert into public.audit_log (actor, action, subject, detail)
  values ((select auth.uid()), case when overridden then 'secret_masked' else 'secret_blocked' end, p_action, jsonb_build_object('patterns', pats, 'rotated', rotated, 'alert', aid));
  return jsonb_build_object('blocked', not overridden, 'masked', overridden, 'subject', subj, 'body', bd, 'patterns', to_jsonb(pats), 'previews', to_jsonb(prevs), 'rotated', to_jsonb(rotated), 'alert_id', aid);
end;
$$;

create function public.raise_ticket(p_subject text, p_body text default '', p_override_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s jsonb; tid bigint; who text;
begin
  if not (select private.has_permission('raise_ticket')) then raise exception 'Your role does not allow this.'; end if;
  if char_length(btrim(coalesce(p_subject, ''))) = 0 then raise exception 'A ticket needs a subject.'; end if;
  if char_length(p_subject) > 120 or char_length(coalesce(p_body, '')) > 4000 then raise exception 'That ticket is too long.'; end if;
  s := private.screen(p_subject, p_body, 'ticket.create', null, p_override_reason);
  if (s ->> 'blocked')::boolean then
    return jsonb_build_object('saved', false, 'blocked', true, 'patterns', s -> 'patterns', 'previews', s -> 'previews', 'rotated', s -> 'rotated');
  end if;
  select email into who from public.profiles where id = (select auth.uid());
  insert into public.support_tickets (subject, body, created_by_email, secret_masked)
  values (left(s ->> 'subject', 120), left(s ->> 'body', 4000), who, (s ->> 'masked')::boolean) returning id into tid;
  return jsonb_build_object('saved', true, 'id', tid, 'masked', (s ->> 'masked')::boolean, 'patterns', coalesce(s -> 'patterns', '[]'::jsonb), 'rotated', coalesce(s -> 'rotated', '[]'::jsonb));
end;
$$;

create function public.add_ticket_comment(p_ticket_id bigint, p_body text, p_override_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s jsonb; who text;
begin
  if not (select private.has_permission('raise_ticket')) then raise exception 'Your role does not allow this.'; end if;
  if char_length(btrim(coalesce(p_body, ''))) = 0 then raise exception 'A comment cannot be empty.'; end if;
  if char_length(p_body) > 4000 then raise exception 'That comment is too long.'; end if;
  if not exists (select 1 from public.support_tickets where id = p_ticket_id) then raise exception 'No such ticket.'; end if;
  s := private.screen('', p_body, 'ticket.comment', p_ticket_id, p_override_reason);
  if (s ->> 'blocked')::boolean then
    return jsonb_build_object('saved', false, 'blocked', true, 'patterns', s -> 'patterns', 'previews', s -> 'previews', 'rotated', s -> 'rotated');
  end if;
  select email into who from public.profiles where id = (select auth.uid());
  insert into public.ticket_comments (ticket_id, body, created_by_email, secret_masked) values (p_ticket_id, left(s ->> 'body', 4000), who, (s ->> 'masked')::boolean);
  return jsonb_build_object('saved', true, 'masked', (s ->> 'masked')::boolean, 'patterns', coalesce(s -> 'patterns', '[]'::jsonb), 'rotated', coalesce(s -> 'rotated', '[]'::jsonb));
end;
$$;

create function public.review_secret_alert(p_id bigint, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.has_permission('review_secret_alerts')) then raise exception 'Your role does not allow this.'; end if;
  update public.secret_alerts set status = 'reviewed', reviewed_by = (select auth.uid()), reviewed_at = now(), review_note = left(p_note, 300) where id = p_id and status = 'open';
end;
$$;

revoke execute on function public.raise_ticket(text, text, text), public.add_ticket_comment(bigint, text, text), public.review_secret_alert(bigint, text) from public, anon;
grant execute on function public.raise_ticket(text, text, text), public.add_ticket_comment(bigint, text, text), public.review_secret_alert(bigint, text) to authenticated;
revoke execute on function private.scan_secrets(text), private.screen(text, text, text, bigint, text) from public, anon, authenticated;
