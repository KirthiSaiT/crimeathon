"use client";

import { useCallback, useEffect, useState } from "react";

export type AsyncState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

export function useAsync<T>(load: () => Promise<T>) {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    load()
      .then((data) => live && setState({ status: "ready", data }))
      .catch((e: unknown) => live && setState({ status: "error", message: e instanceof Error ? e.message : "Something went wrong." }));
    return () => {
      live = false;
    };
  }, [load, attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  return { state, retry };
}
