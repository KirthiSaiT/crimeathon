"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import type { Role } from "@/lib/types";

export interface AccountUser {
  id: string;
  email: string;
  createdAt: string | null;
}

// What a permission lets you do. The matrix itself lives in the database (role_permissions).
export type Permission =
  | "view_case"
  | "save_run"
  | "review_alert"
  | "request_key_action"
  | "resolve_key_action"
  | "request_release"
  | "release_hold"
  | "view_audit"
  | "manage_roles"
  | "manage_settings"
  | "manage_keys"
  | "quarantine_key";

type AuthStatus = "loading" | "signed-out" | "signed-in";

interface AuthContextValue {
  status: AuthStatus;
  user: AccountUser | null;
  role: Role;
  can: (permission: Permission) => boolean;
  permissions: string[];
  configured: boolean;
  // Set when the session ended because the visitor was idle, so the sign-in page can say so.
  idleSignedOut: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  status: "signed-out",
  user: null,
  role: "viewer",
  can: () => false,
  permissions: [],
  configured: false,
  idleSignedOut: false,
  signIn: async () => "Sign-in is not configured.",
  signUp: async () => ({ error: "Sign-in is not configured.", needsConfirmation: false }),
  signOut: async () => {},
});

const ROLES: Role[] = ["viewer", "analyst", "approver", "admin", "vendor"];
const isRole = (v: unknown): v is Role => ROLES.includes(v as Role);

// A signed-in session ends after this long without a click, key press or touch.
export const IDLE_MINUTES = 15;

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(supabaseConfigured ? "loading" : "signed-out");
  const [user, setUser] = useState<AccountUser | null>(null);
  const [role, setRole] = useState<Role>("viewer");
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [idleSignedOut, setIdleSignedOut] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    let live = true;

    const apply = async (session: { user: { id: string; email?: string; created_at?: string } } | null) => {
      if (!live) return;
      if (!session) {
        setUser(null);
        setRole("viewer");
        setPermissions(new Set());
        setStatus("signed-out");
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
      const nextRole: Role = isRole(profile?.role) ? profile.role : "viewer";
      const { data: perms } = await supabase.from("role_permissions").select("permission").eq("role", nextRole);
      if (!live) return;
      setUser({ id: session.user.id, email: session.user.email ?? "", createdAt: session.user.created_at ?? null });
      setRole(nextRole);
      setPermissions(new Set((perms ?? []).map((p: { permission: string }) => p.permission)));
      setStatus("signed-in");
    };

    supabase.auth.getSession().then(({ data }) => apply(data.session));
    // The callback must not await a Supabase call itself, so the work is deferred a tick.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => void apply(session), 0);
    });
    return () => {
      live = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Idle sign-out: every interaction restarts the clock.
  useEffect(() => {
    if (status !== "signed-in") return;
    const supabase = getSupabase();
    const restart = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        setIdleSignedOut(true);
        void supabase?.auth.signOut();
      }, IDLE_MINUTES * 60_000);
    };
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, restart, { passive: true }));
    restart();
    return () => {
      events.forEach((e) => window.removeEventListener(e, restart));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [status]);

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) return "Sign-in is not configured.";
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) setIdleSignedOut(false);
    return error ? error.message : null;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Sign-in is not configured.", needsConfirmation: false };
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { error: error ? error.message : null, needsConfirmation: !error && !data.session };
  }, []);

  const signOut = useCallback(async () => {
    await getSupabase()?.auth.signOut();
  }, []);

  const can = useCallback((permission: Permission) => status === "signed-in" && permissions.has(permission), [status, permissions]);

  const value = useMemo(
    () => ({ status, user, role, can, permissions: [...permissions].sort(), configured: supabaseConfigured, idleSignedOut, signIn, signUp, signOut }),
    [status, user, role, can, permissions, idleSignedOut, signIn, signUp, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useRole = () => useContext(AuthContext);
export const useAuth = useRole;

export const roleLabel: Record<Role, string> = { viewer: "Viewer", analyst: "Analyst", approver: "Approver", admin: "Administrator", vendor: "Vendor" };

// One line on what each role is for. The authoritative list is role_permissions in the database.
export const roleSummary: Record<Role, string> = {
  viewer: "Reads the case. Cannot change anything.",
  analyst: "Saves runs, reviews alerts, requests key actions and asks for a hold to be released.",
  approver: "Releases a held bank change after a call-back, and closes key action requests.",
  admin: "Assigns roles and sets the two-person rule. Cannot move money.",
  vendor: "A supplier's account. Sees none of the case data.",
};

// What each permission lets a person do, in plain words.
export const permissionLabel: Record<string, string> = {
  view_case: "Read the case data",
  save_run: "Save a detector run",
  review_alert: "Record a decision on an alert",
  request_key_action: "Request a key action",
  resolve_key_action: "Close a key action request",
  request_release: "Ask for a held bank change to be released",
  release_hold: "Release a held bank change",
  view_audit: "Read the audit log",
  manage_roles: "Assign roles",
  manage_settings: "Change the two-person rule",
  manage_keys: "Create, rotate, time and revoke keys in the vault",
  quarantine_key: "Put a key into read-only quarantine",
};
