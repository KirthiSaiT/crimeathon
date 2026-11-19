"use client";

import { useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Filters, tabs and the open record live in the URL so a view can be shared and survives a reload.
// The history API keeps this on the client: Next.js syncs useSearchParams without a server round trip.
export function useQueryState(key: string, fallback: string) {
  const params = useSearchParams();
  const pathname = usePathname();
  const value = params.get(key) ?? fallback;

  const set = useCallback(
    (next: string) => {
      const p = new URLSearchParams(window.location.search);
      if (next === fallback || next === "") p.delete(key);
      else p.set(key, next);
      const qs = p.toString();
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, key, fallback],
  );

  return [value, set] as const;
}
