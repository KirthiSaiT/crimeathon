"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useAuth } from "@/components/role-provider";
import { getSupabase } from "@/lib/supabase/client";
import type { Analysis } from "@/engine/types";
import type { Alert, Role } from "@/lib/types";

// Alert numbers (A-01) change between runs, so a review is keyed by the key, the title and the start time.
export const alertRef = (a: Alert) => `${a.key}|${a.title}|${a.start}`;

export type KeyActionKind = "suspend" | "quarantine" | "rotate" | "set_expiry" | "narrow_scope" | "set_range";
export type ReviewDecision = "confirmed" | "set_aside" | "needs_info";

export interface ReleaseRow {
  change_id: string;
  released_at: string;
  call_back_note: string | null;
}
export interface ReviewRow {
  alert_ref: string;
  decision: ReviewDecision;
  note: string | null;
  reviewed_at: string;
}
export interface KeyActionRow {
  id: string;
  credential_id: string;
  action: KeyActionKind;
  status: "requested" | "done" | "cancelled";
  note: string | null;
  requested_at: string;
}
export interface RunRow {
  id: string;
  created_at: string;
  source: "supplied" | "upload";
  label: string | null;
  stats: Analysis["stats"];
}
export interface AuditRow {
  id: number;
  at: string;
  action: string;
  subject: string;
  detail: Record<string, unknown>;
}

interface Remote<T> {
  data: T | null; // null while loading
  error: string | null;
  reload: () => void;
}

// Reads a table once the visitor is signed in. Row-level security decides what comes back.
function useRemote<T>(load: (sb: SupabaseClient) => PromiseLike<{ data: T | null; error: { message: string } | null }>, enabled: boolean): Remote<T> {
  const [result, setResult] = useState<{ data: T | null; error: string | null }>({ data: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !enabled) return;
    let live = true;
    Promise.resolve(load(sb)).then(({ data, error }) => {
      if (live) setResult({ data: error ? null : data, error: error ? error.message : null });
    });
    return () => {
      live = false;
    };
    // load is an inline function in every caller; only the sign-in state and a manual reload matter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...result, reload };
}

const friendly = (message: string) =>
  /row-level security|permission denied/i.test(message) ? "Your role does not allow this." : /duplicate key/i.test(message) ? "This has already been recorded." : message;

export function useHoldReleases() {
  const { status } = useAuth();
  const r = useRemote<ReleaseRow[]>((sb) => sb.from("hold_releases").select("change_id, released_at, call_back_note"), status === "signed-in");
  const { reload } = r;
  const release = useCallback(
    async (changeId: string, note: string) => {
      const sb = getSupabase();
      if (!sb) return "The database is not configured.";
      const { error } = await sb.from("hold_releases").insert({ change_id: changeId, call_back_confirmed: true, call_back_note: note || null });
      if (error) return friendly(error.message);
      reload();
      return null;
    },
    [reload],
  );
  return { released: (r.data ?? []).map((x) => x.change_id), error: r.error, loaded: r.data !== null, release };
}

export function useAlertReviews() {
  const { status } = useAuth();
  const r = useRemote<ReviewRow[]>((sb) => sb.from("alert_reviews").select("alert_ref, decision, note, reviewed_at"), status === "signed-in");
  const { reload } = r;
  const review = useCallback(
    async (ref: string, decision: ReviewDecision, note: string) => {
      const sb = getSupabase();
      if (!sb) return "The database is not configured.";
      const { error } = await sb.from("alert_reviews").upsert({ alert_ref: ref, decision, note: note || null }, { onConflict: "alert_ref" });
      if (error) return friendly(error.message);
      reload();
      return null;
    },
    [reload],
  );
  const byRef = new Map((r.data ?? []).map((x) => [x.alert_ref, x]));
  return { byRef, error: r.error, review };
}

export function useKeyActions() {
  const { status } = useAuth();
  const r = useRemote<KeyActionRow[]>(
    (sb) => sb.from("key_actions").select("id, credential_id, action, status, note, requested_at").order("requested_at", { ascending: false }),
    status === "signed-in",
  );
  const { reload } = r;
  const request = useCallback(
    async (credentialId: string, action: KeyActionKind, note: string) => {
      const sb = getSupabase();
      if (!sb) return "The database is not configured.";
      const { error } = await sb.from("key_actions").insert({ credential_id: credentialId, action, note: note || null });
      if (error) return friendly(error.message);
      reload();
      return null;
    },
    [reload],
  );
  const setStatus = useCallback(
    async (id: string, next: "done" | "cancelled") => {
      const sb = getSupabase();
      if (!sb) return "The database is not configured.";
      const { error } = await sb.from("key_actions").update({ status: next, done_at: next === "done" ? new Date().toISOString() : null }).eq("id", id);
      if (error) return friendly(error.message);
      reload();
      return null;
    },
    [reload],
  );
  return { actions: r.data ?? [], error: r.error, request, setStatus };
}

export function useRuns() {
  const { status } = useAuth();
  const r = useRemote<RunRow[]>((sb) => sb.from("analysis_runs").select("id, created_at, source, label, stats").order("created_at", { ascending: false }).limit(50), status === "signed-in");
  const { reload } = r;
  const save = useCallback(
    async (analysis: Analysis, label: string) => {
      const sb = getSupabase();
      if (!sb) return "The database is not configured.";
      const { error } = await sb.from("analysis_runs").insert({
        source: analysis.stats.labelled ? "supplied" : "upload",
        label: label || null,
        stats: analysis.stats,
        files: analysis.files,
        analysis,
      });
      if (error) return friendly(error.message);
      reload();
      return null;
    },
    [reload],
  );
  return { runs: r.data, error: r.error, save };
}

export function useAuditLog() {
  const { can } = useAuth();
  const r = useRemote<AuditRow[]>(
    (sb) => sb.from("audit_log").select("id, at, action, subject, detail").order("at", { ascending: false }).limit(100),
    can("view_audit"),
  );
  return { rows: r.data, error: r.error };
}

export interface HoldRequestRow {
  change_id: string;
  requested_by: string;
  requested_at: string;
  note: string | null;
}

// A release is requested by one person and approved by another.
export function useHoldRequests() {
  const { status } = useAuth();
  const r = useRemote<HoldRequestRow[]>((sb) => sb.from("hold_requests").select("change_id, requested_by, requested_at, note"), status === "signed-in");
  const { reload } = r;
  const request = useCallback(
    async (changeId: string, note: string) => {
      const sb = getSupabase();
      if (!sb) return "The database is not configured.";
      const { error } = await sb.from("hold_requests").insert({ change_id: changeId, note: note || null });
      if (error) return friendly(error.message);
      reload();
      return null;
    },
    [reload],
  );
  return { requests: r.data ?? [], error: r.error, request };
}

export function useSettings() {
  const { status, can } = useAuth();
  const r = useRemote<{ two_person_rule: boolean }[]>((sb) => sb.from("app_settings").select("two_person_rule"), status === "signed-in");
  const { reload } = r;
  const setTwoPersonRule = useCallback(
    async (on: boolean) => {
      const sb = getSupabase();
      if (!sb) return "The database is not configured.";
      const { error } = await sb.from("app_settings").update({ two_person_rule: on }).eq("id", true);
      if (error) return friendly(error.message);
      reload();
      return null;
    },
    [reload],
  );
  return { twoPersonRule: r.data?.[0]?.two_person_rule ?? true, canChange: can("manage_settings"), setTwoPersonRule };
}

export interface TeamRow {
  id: string;
  email: string | null;
  display_name: string | null;
  role: Role;
  created_at: string;
}

export function useTeam() {
  const { can } = useAuth();
  const r = useRemote<TeamRow[]>((sb) => sb.from("profiles").select("id, email, display_name, role, created_at").order("created_at"), can("manage_roles"));
  const { reload } = r;
  const setRole = useCallback(
    async (id: string, role: Role) => {
      const sb = getSupabase();
      if (!sb) return "The database is not configured.";
      const { error } = await sb.from("profiles").update({ role }).eq("id", id);
      if (error) return friendly(error.message);
      reload();
      return null;
    },
    [reload],
  );
  return { team: r.data, error: r.error, setRole };
}

export function usePermissionMatrix() {
  const { status } = useAuth();
  const r = useRemote<{ role: Role; permission: string }[]>((sb) => sb.from("role_permissions").select("role, permission"), status === "signed-in");
  return { rows: r.data, error: r.error };
}
