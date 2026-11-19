"use client";

import { useEffect, useState } from "react";
import { Play, Square } from "lucide-react";
import { Section } from "@/components/page-shell";
import { Tag } from "@/components/tag";
import { Button } from "@/components/ui/button";
import { Db, DbBody, DbCell, DbHead, DbHeader, DbRow, td, th } from "@/components/db";

interface RunResults {
  startedAt: string;
  finishedAt: string;
  base: string;
  summary: { total: number; passed: number; failed: number };
  tests: { id: string; name: string; status: string; ms: number; error?: string }[];
  note?: string | null;
  worst: { page: string; pageReadyMs: number; serverAnalysisMaxMs: number; browserUploadMaxMs: number } | null;
  scaling: { factor: number; rows: number; seconds: number; status: number }[] | null;
}
interface RunStatus {
  enabled: boolean;
  reason?: string;
  running: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  exitCode: number | null;
  mode?: string;
  log: string[];
  results: RunResults | null;
  error?: string;
}

const clock = (iso: string) => new Date(iso).toISOString().replace("T", " ").slice(0, 19) + " UTC";

// Runs the Selenium suite on demand. The suite opens a real browser on this machine and walks the app.
export function SeleniumPanel() {
  const [s, setS] = useState<RunStatus | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const running = s?.running ?? false;

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const res = await fetch("/api/e2e", { cache: "no-store" });
        const body = (await res.json()) as RunStatus;
        if (!live) return;
        if (!res.ok) return setFailure(body.error ?? "The test status could not be read.");
        setFailure(null);
        setS(body);
      } catch {
        if (live) setFailure("The test status could not be read.");
      }
    };
    void load();
    if (!running) return () => void (live = false);
    const timer = setInterval(() => void load(), 2000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [running]);

  const send = async (method: "POST" | "DELETE") => {
    setFailure(null);
    const res = await fetch("/api/e2e", { method });
    const body = (await res.json()) as RunStatus;
    if (!res.ok) return setFailure(body.error ?? "That did not work.");
    setS(body);
  };

  const finished = s?.log.filter((l) => /^(PASS|FAIL)\s/.test(l)).length ?? 0;
  const r = s?.results;

  return (
    <Section
      title="Selenium test simulator"
      note="Opens a real browser on this computer and walks the app the way a person would: uploads, role gates, dark mode, phone width, every page. It then measures load times."
      action={
        s?.enabled ? (
          running ? (
            <Button variant="outline" size="sm" onClick={() => void send("DELETE")}>
              <Square className="size-4" aria-hidden="true" />
              Stop the run
            </Button>
          ) : (
            <Button size="sm" onClick={() => void send("POST")}>
              <Play className="size-4" aria-hidden="true" />
              Run the Selenium tests
            </Button>
          )
        ) : null
      }
    >
      {failure ? (
        <p role="alert" className="text-sm text-[var(--tp)]">
          {failure}
        </p>
      ) : null}

      {s && !s.enabled ? (
        <div className="max-w-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 text-sm">
          <p>{s.reason}</p>
          <p className="mt-2 text-[var(--ink-secondary)]">
            In a terminal, in the project folder: <span className="font-mono">npm run build</span>, <span className="font-mono">npm start</span>, then <span className="font-mono">npm run e2e</span>.
          </p>
        </div>
      ) : null}

      {s?.enabled && s.mode !== "production" ? (
        <p className="max-w-2xl text-sm text-[var(--ink-tertiary)]">
          This server is in development mode, which compiles each page the first time it is opened, so the load times here read slower than a production build. For the figures to give the judge, use <span className="font-mono">npm run build</span>,{" "}
          <span className="font-mono">npm start</span> and then <span className="font-mono">npm run e2e</span>.
        </p>
      ) : null}

      {running ? (
        <div role="status" className="flex max-w-3xl flex-col gap-2 border border-[var(--line)] bg-[var(--bg-elevated)] p-4 text-sm">
          <p className="font-medium">
            Running. {finished} of {r?.summary.total ?? 19} checks finished. The whole run takes a few minutes, and it ends with the load-time measurements.
          </p>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap font-mono text-xs text-[var(--ink-secondary)]">{s?.log.join("\n")}</pre>
        </div>
      ) : null}

      {!running && s?.enabled && s.finishedAt && s.exitCode !== 0 ? (
        <p role="alert" className="max-w-2xl text-sm text-[var(--tp)]">
          The run did not finish{s.exitCode === null ? "" : ` (code ${s.exitCode})`}. The last lines of its log:
          <span className="mt-2 block font-mono text-xs whitespace-pre-wrap text-[var(--ink-secondary)]">{s.log.slice(-8).join("\n")}</span>
        </p>
      ) : null}

      {r && !running ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            <span className="font-medium">
              {r.summary.passed} of {r.summary.total} passed
            </span>
            {r.summary.failed > 0 ? <Tag color="red">{r.summary.failed} failed</Tag> : null}
            <span className="text-[var(--ink-tertiary)]">
              {" "}
              Finished {clock(r.finishedAt)} against {r.base}.
            </span>
          </p>
          {r.note ? <p className="max-w-2xl text-sm text-[var(--ink-secondary)]">{r.note}</p> : null}
          {r.worst ? (
            <dl className="grid max-w-3xl grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-[var(--ink-tertiary)]">Slowest page ({r.worst.page})</dt>
                <dd className="num text-xl font-medium">{r.worst.pageReadyMs} ms</dd>
              </div>
              <div>
                <dt className="text-[var(--ink-tertiary)]">Slowest analysis on the server</dt>
                <dd className="num text-xl font-medium">{r.worst.serverAnalysisMaxMs} ms</dd>
              </div>
              <div>
                <dt className="text-[var(--ink-tertiary)]">Slowest upload in the browser</dt>
                <dd className="num text-xl font-medium">{r.worst.browserUploadMaxMs} ms</dd>
              </div>
            </dl>
          ) : null}
          <div className="overflow-x-auto">
            <Db className="min-w-[40rem]">
              <DbHeader>
                <DbRow className="hover:bg-transparent">
                  <DbHead className={th}>Test</DbHead>
                  <DbHead className={th}>What it checks</DbHead>
                  <DbHead className={th}>Result</DbHead>
                  <DbHead className={`${th} text-right`}>Time</DbHead>
                </DbRow>
              </DbHeader>
              <DbBody>
                {r.tests.map((t) => (
                  <DbRow key={t.id} className="hover:bg-paper-2">
                    <DbCell className={`${td} num whitespace-nowrap`}>{t.id}</DbCell>
                    <DbCell className={`${td} whitespace-normal`}>
                      {t.name}
                      {t.error ? <span className="block text-[var(--tp)]">{t.error}</span> : null}
                    </DbCell>
                    <DbCell className={td}>
                      <Tag color={t.status === "pass" ? "green" : "red"}>{t.status === "pass" ? "Passed" : "Failed"}</Tag>
                    </DbCell>
                    <DbCell className={`${td} num text-right`}>{t.ms} ms</DbCell>
                  </DbRow>
                ))}
              </DbBody>
            </Db>
          </div>
          <p className="max-w-2xl text-sm text-[var(--ink-tertiary)]">The full report, with screenshots, is written to .e2e/latest/report.html each time a run finishes. The reference results in docs/selenium are only changed by npm run e2e.</p>
        </div>
      ) : null}

      {s?.enabled && !r && !running ? <p className="text-sm text-[var(--ink-secondary)]">No run yet. Press the button to start one.</p> : null}
    </Section>
  );
}
