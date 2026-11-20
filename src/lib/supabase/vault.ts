"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/role-provider";
import { getSupabase } from "@/lib/supabase/client";

export type SystemId = "ledgerone" | "helpdeskr" | "bluevault";
export type KeyStatus = "active" | "quarantined" | "revoked";
export type RangeMode = "off" | "monitor" | "enforce";
export type OnCritical = "none" | "quarantine" | "revoke";

export interface ManagedKey {
  id: string;
  system: SystemId;
  name: string;
  scope: string[];
  status: KeyStatus;
  rotation_seconds: number;
  grace_seconds: number;
  auto_rotate: boolean;
  allowed_ranges: string[];
  range_mode: RangeMode;
  on_critical: OnCritical;
  parent_id: string | null;
  prefix: string;
  version: number;
  created_at: string;
  rotated_at: string;
  expires_at: string;
}

export interface KeyEvent {
  id: number;
  at: string;
  key_name: string | null;
  system: string | null;
  action: string | null;
  outcome: string;
  reason: string | null;
  secret_prefix: string | null;
  source_ip: string | null;
  critical: boolean;
  // How the gateway judged the call: a score from 0 to 100, the verdict, and the reasons behind it.
  risk: number | null;
  decision: Decision | null;
  reasons: string[] | null;
}

export type Decision = "ALLOWED" | "SUSPICIOUS" | "BLOCKED";

export interface PendingChange {
  id: string;
  vendor_id: string;
  old_last4: string;
  new_last4: string;
  key_name: string | null;
  source_ip: string | null;
  contact_recent: boolean;
  status: "held" | "released" | "rejected";
  created_at: string;
  release_requested_by: string | null;
  release_requested_at: string | null;
  release_note: string | null;
  decided_at: string | null;
}

export interface ReplayStep {
  n: number;
  title: string;
  ip: string;
  action: string;
  status: string;
  result: string;
  key: string;
  key_status: KeyStatus;
}
export interface ReplayResult {
  steps: ReplayStep[];
  bank_after: string;
  held: number;
}
export interface SplitKey {
  name: string;
  scope: string[];
  secret: string;
}

// The three simulated systems and what a key can be allowed to do in each.
export const SYSTEMS: Record<SystemId, { label: string; blurb: string; actions: { id: string; label: string; params: string }[] }> = {
  ledgerone: {
    label: "LedgerOne",
    blurb: "Finance: vendors and their bank accounts",
    actions: [
      { id: "vendors.read", label: "Read vendor names", params: "{}" },
      { id: "vendors.bank.read", label: "Read vendor bank details", params: "{}" },
      { id: "vendors.bank.write", label: "Ask to change a vendor's bank account (held for people)", params: '{"vendor_id":"V-0412","last4":"9083"}' },
      { id: "vendors.contact.write", label: "Change a vendor's contact phone", params: '{"vendor_id":"V-0412","phone":"555-0100"}' },
    ],
  },
  helpdeskr: {
    label: "HelpDeskr",
    blurb: "Support tickets",
    actions: [
      { id: "tickets.read", label: "Read tickets", params: "{}" },
      { id: "tickets.write", label: "Open a ticket", params: '{"subject":"Hello from the console"}' },
    ],
  },
  bluevault: {
    label: "BlueVault",
    blurb: "Company documents",
    actions: [
      { id: "files.list", label: "List files", params: "{}" },
      { id: "files.read", label: "Read a file", params: '{"id":"F-02"}' },
    ],
  },
};

// Addresses the console can pretend to call from. A real gateway reads the address from the network;
// here the caller declares it, so the page says so.
export const SOURCES: { ip: string; label: string }[] = [
  { ip: "10.20.4.12", label: "10.20.4.12, a vendor sync computer" },
  { ip: "10.20.4.77", label: "10.20.4.77, the vendor build computer" },
  { ip: "172.16.8.31", label: "172.16.8.31, the finance office" },
  { ip: "198.18.7.41", label: "198.18.7.41, a home-internet address" },
  { ip: "", label: "No address given" },
];

const COLUMNS =
  "id, system, name, scope, status, rotation_seconds, grace_seconds, auto_rotate, allowed_ranges, range_mode, on_critical, parent_id, prefix, version, created_at, rotated_at, expires_at";
const EVENT_COLUMNS = "id, at, key_name, system, action, outcome, reason, secret_prefix, source_ip, critical, risk, decision, reasons";
const POLL_MS = 4000;

const friendly = (message: string) => (/row-level security|permission denied/i.test(message) ? "Your role does not allow this." : message);

type Sb = NonNullable<ReturnType<typeof getSupabase>>;

// The vault, refreshed every few seconds so rotations and cut-offs show up as they happen.
export function useVault() {
  const { status, can } = useAuth();
  const [keys, setKeys] = useState<ManagedKey[] | null>(null);
  const [events, setEvents] = useState<KeyEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || status !== "signed-in" || !can("view_case")) return;
    let live = true;
    const load = async () => {
      await sb.rpc("rotate_due_keys"); // a key past its time is replaced now, not at the next scheduled run
      const [k, e] = await Promise.all([
        sb.from("managed_keys").select(COLUMNS).order("created_at"),
        sb.from("key_events").select(EVENT_COLUMNS).order("at", { ascending: false }).limit(60),
      ]);
      if (!live) return;
      if (k.error || e.error) setError((k.error ?? e.error)!.message);
      else {
        setError(null);
        setKeys(k.data as ManagedKey[]);
        setEvents(e.data as KeyEvent[]);
      }
    };
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [status, can, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  // Each action returns the data (a secret, for some) and an error message, one of which is null.
  const run = useCallback(
    async <T,>(call: (sb: Sb) => PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<{ data: T | null; error: string | null }> => {
      const sb = getSupabase();
      if (!sb) return { data: null, error: "The database is not configured." };
      const { data, error: failure } = await call(sb);
      if (failure) return { data: null, error: friendly(failure.message) };
      reload();
      return { data, error: null };
    },
    [reload],
  );

  return {
    keys,
    events,
    error,
    reload,
    create: (v: {
      system: SystemId;
      name: string;
      scope: string[];
      rotationSeconds: number;
      graceSeconds: number;
      autoRotate: boolean;
      ranges: string[];
      rangeMode: RangeMode;
      onCritical: OnCritical;
    }) =>
      run<string>((sb) =>
        sb.rpc("create_managed_key", {
          p_system: v.system,
          p_name: v.name,
          p_scope: v.scope,
          p_rotation_seconds: v.rotationSeconds,
          p_grace_seconds: v.graceSeconds,
          p_auto_rotate: v.autoRotate,
          p_ranges: v.ranges,
          p_range_mode: v.rangeMode,
          p_on_critical: v.onCritical,
        }),
      ),
    rotate: (id: string) => run<string>((sb) => sb.rpc("rotate_managed_key", { p_id: id })),
    reveal: (id: string) => run<string>((sb) => sb.rpc("reveal_managed_key_secret", { p_id: id })),
    setStatus: (id: string, next: KeyStatus) => run<null>((sb) => sb.rpc("set_managed_key_status", { p_id: id, p_status: next })),
    setTiming: (id: string, rotationSeconds: number, graceSeconds: number, autoRotate: boolean) =>
      run<null>((sb) => sb.rpc("update_managed_key_timing", { p_id: id, p_rotation_seconds: rotationSeconds, p_grace_seconds: graceSeconds, p_auto_rotate: autoRotate })),
    setGuard: (id: string, ranges: string[], mode: RangeMode, onCritical: OnCritical) =>
      run<null>((sb) => sb.rpc("update_managed_key_guard", { p_id: id, p_ranges: ranges, p_range_mode: mode, p_on_critical: onCritical })),
    suggestRanges: (id: string) => run<string[]>((sb) => sb.rpc("suggest_key_ranges", { p_id: id })),
    split: (id: string, retire: boolean) => run<SplitKey[]>((sb) => sb.rpc("split_managed_key", { p_id: id, p_retire: retire })),
    replay: () => run<ReplayResult>((sb) => sb.rpc("run_attack_replay")),
    resetDemo: () => run<null>((sb) => sb.rpc("reset_sim_data")),
  };
}

const PENDING_COLUMNS =
  "id, vendor_id, old_last4, new_last4, key_name, source_ip, contact_recent, status, created_at, release_requested_by, release_requested_at, release_note, decided_at";

// Bank changes the simulated LedgerOne holds because a key asked for them.
export function usePendingChanges() {
  const { status } = useAuth();
  const [rows, setRows] = useState<PendingChange[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || status !== "signed-in") return;
    let live = true;
    const load = async () => {
      const r = await sb.from("sim_pending_changes").select(PENDING_COLUMNS).order("created_at", { ascending: false }).limit(50);
      if (!live) return;
      if (r.error) setError(r.error.message);
      else {
        setError(null);
        setRows(r.data as PendingChange[]);
      }
    };
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [status, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const act = useCallback(
    async (fn: string, args: Record<string, unknown>) => {
      const sb = getSupabase();
      if (!sb) return "The database is not configured.";
      const { error: failure } = await sb.rpc(fn, args);
      if (failure) return friendly(failure.message);
      reload();
      return null;
    },
    [reload],
  );
  return {
    rows,
    error,
    requestRelease: (id: string, note: string) => act("request_sim_release", { p_id: id, p_note: note || null }),
    decide: (id: string, release: boolean, note: string) => act("decide_sim_change", { p_id: id, p_release: release, p_note: note || null }),
  };
}

// A clock that ticks once a second, for countdowns.
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export const formatCountdown = (ms: number) => {
  if (ms <= 0) return "now";
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};

// A comma or newline separated list of ranges, as the form takes it.
export const parseRanges = (text: string) =>
  text
    .split(/[\s,;]+/)
    .map((r) => r.trim())
    .filter(Boolean);
