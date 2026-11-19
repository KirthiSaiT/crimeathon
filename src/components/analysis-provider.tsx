"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Analysis } from "@/engine/types";
import type { AsyncState } from "@/lib/use-async";

interface AnalysisContextValue {
  state: AsyncState<Analysis>;
  reload: () => void;
  replace: (analysis: Analysis) => void;
  // Forget the uploaded logs and go back to an empty app.
  clear: () => void;
}

const AnalysisContext = createContext<AnalysisContextValue>({ state: { status: "loading" }, reload: () => {}, replace: () => {}, clear: () => {} });

// Uploaded results are kept for this browser tab, so a reload does not lose them. Closing the tab forgets them.
const STORAGE_KEY = "warden-analysis";

function remembered(): Analysis | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Analysis) : null;
  } catch {
    return null;
  }
}

async function fetchAnalysis(): Promise<Analysis> {
  const res = await fetch("/api/analysis");
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `The server answered ${res.status}.`);
  return body as Analysis;
}

// Holds the detector's output for the whole app. It starts empty and fills when logs are uploaded.
export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AsyncState<Analysis>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    const kept = remembered();
    (kept ? Promise.resolve(kept) : fetchAnalysis())
      .then((data) => live && setState({ status: "ready", data }))
      .catch((e: unknown) => live && setState({ status: "error", message: e instanceof Error ? e.message : "The detector could not be reached." }));
    return () => {
      live = false;
    };
  }, [attempt]);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);
  const replace = useCallback((analysis: Analysis) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(analysis));
    } catch {
      // storage can be full or blocked; the result then lasts until the page is reloaded
    }
    setState({ status: "ready", data: analysis });
  }, []);
  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // nothing to forget
    }
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);
  const value = useMemo(() => ({ state, reload, replace, clear }), [state, reload, replace, clear]);
  return <AnalysisContext.Provider value={value}>{children}</AnalysisContext.Provider>;
}

export const useAnalysis = () => useContext(AnalysisContext);

// A page reads the part of the analysis it needs, with the same loading, error and ready states.
export function useSlice<T>(select: (analysis: Analysis) => T): { state: AsyncState<T>; retry: () => void } {
  const { state, reload } = useAnalysis();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const slice = useMemo<AsyncState<T>>(() => (state.status === "ready" ? { status: "ready", data: select(state.data) } : state), [state]);
  return { state: slice, retry: reload };
}
