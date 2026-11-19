"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/role-provider";
import { getSupabase } from "@/lib/supabase/client";

export type SystemId = "ledgerone" | "helpdeskr" | "bluevault";
export type KeyStatus = "active" | "quarantined" | "revoked";

export interface ManagedKey {
  id: string;
  system: SystemId;
  name: string;
  scope: string[];
  status: KeyStatus;
  rotation_seconds: number;
  grace_seconds: number;
  auto_rotate: boolean;
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
}

// The three simulated systems and what a key can be allowed to do in each.
export const SYSTEMS: Record<SystemId, { label: string; blurb: string; actions: { id: string; label: string; params: string }[] }> = {
  ledgerone: {
    label: "LedgerOne",
    blurb: "Finance: vendors and their bank accounts",
    actions: [
      { id: "vendors.read", label: "Read vendor names", params: "{}" },
      { id: "vendors.bank.read", label: "Read vendor bank details", params: "{}" },
      { id: "vendors.bank.write", label: "Change a vendor's bank account", params: '{"vendor_id":"V-0412","last4":"9083"}' },
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

const COLUMNS = "id, system, name, scope, status, rotation_seconds, grace_seconds, auto_rotate, prefix, version, created_at, rotated_at, expires_at";
const POLL_MS = 4000;

const friendly = (message: string) => (/row-level security|permission denied/i.test(message) ? "Your role does not allow this." : message);

// The vault, refreshed every few seconds so rotations show up as they happen.
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
        sb.from("key_events").select("id, at, key_name, system, action, outcome, reason, secret_prefix").order("at", { ascending: false }).limit(40),
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

  // Each action returns an error message, or null (and, for secrets, the secret).
  const run = useCallback(
    async <T,>(call: (sb: NonNullable<ReturnType<typeof getSupabase>>) => PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<{ data: T | null; error: string | null }> => {
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
    create: (v: { system: SystemId; name: string; scope: string[]; rotationSeconds: number; graceSeconds: number; autoRotate: boolean }) =>
      run<string>((sb) =>
        sb.rpc("create_managed_key", { p_system: v.system, p_name: v.name, p_scope: v.scope, p_rotation_seconds: v.rotationSeconds, p_grace_seconds: v.graceSeconds, p_auto_rotate: v.autoRotate }),
      ),
    rotate: (id: string) => run<string>((sb) => sb.rpc("rotate_managed_key", { p_id: id })),
    reveal: (id: string) => run<string>((sb) => sb.rpc("reveal_managed_key_secret", { p_id: id })),
    setStatus: (id: string, next: KeyStatus) => run<null>((sb) => sb.rpc("set_managed_key_status", { p_id: id, p_status: next })),
    setTiming: (id: string, rotationSeconds: number, graceSeconds: number, autoRotate: boolean) =>
      run<null>((sb) => sb.rpc("update_managed_key_timing", { p_id: id, p_rotation_seconds: rotationSeconds, p_grace_seconds: graceSeconds, p_auto_rotate: autoRotate })),
    resetDemo: () => run<null>((sb) => sb.rpc("reset_sim_data")),
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
