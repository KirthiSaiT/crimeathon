-- Alert numbers (A-01) change between runs, so a review is keyed by a stable reference instead:
-- the key, the alert title and its start time. The run is kept when known.
drop table public.alert_reviews;

create table public.alert_reviews (
  id uuid primary key default gen_random_uuid(),
  alert_ref text not null unique,
  run_id uuid references public.analysis_runs (id) on delete set null,
  decision text not null check (decision in ('confirmed', 'set_aside', 'needs_info')),
  note text,
  reviewed_by uuid not null default auth.uid() references auth.users (id),
  reviewed_at timestamptz not null default now()
);
create index alert_reviews_run_id_idx on public.alert_reviews (run_id);
create index alert_reviews_reviewed_by_idx on public.alert_reviews (reviewed_by);

revoke all on public.alert_reviews from anon;
alter table public.alert_reviews enable row level security;

create policy "read reviews" on public.alert_reviews for select to authenticated using (true);
create policy "analysts review alerts" on public.alert_reviews for insert to authenticated
  with check (reviewed_by = (select auth.uid()) and (select private.current_app_role()) in ('analyst', 'approver'));
create policy "analysts change own reviews" on public.alert_reviews for update to authenticated
  using (reviewed_by = (select auth.uid()) and (select private.current_app_role()) in ('analyst', 'approver'))
  with check (reviewed_by = (select auth.uid()));

create function private.audit_alert_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (actor, action, subject, detail)
  values ((select auth.uid()), 'alert_' || lower(tg_op), new.alert_ref, jsonb_build_object('decision', new.decision));
  return new;
end;
$$;
revoke execute on function private.audit_alert_review() from public, anon, authenticated;
create trigger alert_reviews_audit after insert or update on public.alert_reviews
for each row execute function private.audit_alert_review();
