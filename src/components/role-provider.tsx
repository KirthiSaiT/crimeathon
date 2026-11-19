"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import type { Role } from "@/lib/types";

interface RoleContextValue {
  role: Role;
  setRole: (role: Role) => void;
}

const RoleContext = createContext<RoleContextValue>({ role: "analyst", setRole: () => {} });
const STORAGE_KEY = "key-guard-role";
const listeners = new Set<() => void>();

function readRole(): Role {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "analyst" || saved === "approver" || saved === "viewer") return saved;
  } catch {
    // storage can be unavailable; the default role stays
  }
  return "analyst";
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
};

export function RoleProvider({ children }: { children: React.ReactNode }) {
  // The server and the first client render use the default, then the saved role takes over.
  const role = useSyncExternalStore(subscribe, readRole, () => "analyst" as Role);

  const setRole = useCallback((next: Role) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
    listeners.forEach((l) => l());
  }, []);

  const value = useMemo(() => ({ role, setRole }), [role, setRole]);
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export const useRole = () => useContext(RoleContext);

export const roleLabel: Record<Role, string> = { analyst: "Analyst", approver: "Approver", viewer: "Viewer" };
