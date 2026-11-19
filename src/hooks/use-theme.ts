"use client";

import { useCallback, useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "kg-theme";
const listeners = new Set<() => void>();

// The inline script in the root layout sets the class before first paint, so the document is the source of truth.
const read = (): Theme => (document.documentElement.classList.contains("dark") ? "dark" : "light");
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
const subscribeNone = () => () => {};

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => "light" as Theme);
  const mounted = useSyncExternalStore(subscribeNone, () => true, () => false);

  const toggle = useCallback(() => {
    const next: Theme = read() === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.style.colorScheme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage can be unavailable; the choice then lasts for the visit only
    }
    listeners.forEach((l) => l());
  }, []);

  return { theme, toggle, mounted };
}
