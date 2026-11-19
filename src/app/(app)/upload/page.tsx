"use client";

import Link from "next/link";
import { useState } from "react";
import { FileUp, Info, Play } from "lucide-react";
import { Callout, PageShell, Section } from "@/components/page-shell";
import { Tag, type TagColor } from "@/components/tag";
import { Db, DbBody, DbCell, DbHead, DbHeader, DbRow, td, th } from "@/components/db";
import { EmptyState } from "@/components/states";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAnalysis } from "@/components/analysis-provider";
import { detectKind } from "@/engine/loaders";
import { parseFacts } from "@/engine/facts";
import { cn } from "@/lib/utils";
import type { Analysis } from "@/engine/types";

const kindName: Record<string, string> = {
  ledger: "LedgerOne API log",
  helpdesk: "HelpDeskr audit log",
  sso: "Sign-in log",
  bluevault: "BlueVault access log",
  flows: "Private-link flow log",
  changes: "Vendor change log",
  register: "Connected software register",
  facts: "Case facts",
};

interface Checked {
  file: File;
  size: string;
  label: string;
  color: TagColor;
  detail: string;
  ok: boolean;
}

// Recognise a file by what is inside it, not by what it is called.
async function check(file: File): Promise<Checked> {
  const size = file.size > 1e6 ? `${(file.size / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1e3))} KB`;
  const bad = (detail: string): Checked => ({ file, size, label: "Not recognised", color: "red", detail, ok: false });

  if (file.name.toLowerCase().endsWith(".json")) {
    try {
      const j = JSON.parse(await file.text()) as { integrations?: { credential_id?: string }[] };
      if (Array.isArray(j.integrations) && j.integrations[0]?.credential_id) {
        return { file, size, label: "Recognised", color: "green", detail: `${kindName.register}: ${j.integrations.length} keys.`, ok: true };
      }
      if (parseFacts(j)) return { file, size, label: "Recognised", color: "green", detail: `${kindName.facts}: facts about the case that logs cannot say, such as claims and maintenance windows.`, ok: true };
    } catch {
      return bad("This is not valid JSON.");
    }
    return bad("A JSON file must be a key register (an integrations list) or a case-facts file (claims, maintenance, attacker ranges).");
  }

  const head = (await file.slice(0, 8192).text()).split(/\r?\n/)[0].split(",").map((c) => c.trim());
  const kind = detectKind(head);
  if (!kind) return bad(`The columns are not those of a known log. First columns found: ${head.slice(0, 6).join(", ") || "none"}.`);
  return { file, size, label: "Recognised", color: "green", detail: `${kindName[kind] ?? kind}: matched by its columns.`, ok: true };
}

export default function UploadPage() {
  const { state, replace, clear } = useAnalysis();
  const [results, setResults] = useState<Checked[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Analysis | null>(null);

  const loaded = state.status === "ready" ? state.data : null;

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setDone(null);
    setError(null);
    setResults(await Promise.all(Array.from(files).map(check)));
    setBusy(false);
  };

  const run = async () => {
    if (!results) return;
    setRunning(true);
    setError(null);
    const form = new FormData();
    results.filter((r) => r.ok).forEach((r) => form.append("logs", r.file));
    try {
      const res = await fetch("/api/analysis", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `The server answered ${res.status}.`);
      replace(body as Analysis);
      setDone(body as Analysis);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The detector could not run.");
    } finally {
      setRunning(false);
    }
  };

  const okCount = results?.filter((r) => r.ok).length ?? 0;

  return (
    <PageShell icon={FileUp} title="Upload logs" lead="Warden starts empty. Choose logs, a key register and, if you have them, case facts, then run the detector. Every page fills from what you upload and nothing else.">
      <Callout icon={Info}>
        <p>
          Files are recognised by their columns, so a renamed log still loads. Each run replaces the previous one. Results are kept in this browser tab only, and the files are analysed on the server and not stored.
        </p>
      </Callout>

      <Section title="Loaded now" note="What the pages are showing at the moment.">
        {loaded && loaded.files.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <Db className="min-w-[36rem]">
                <DbHeader>
                  <DbRow className="hover:bg-transparent">
                    <DbHead className={th}>File</DbHead>
                    <DbHead className={th}>What it is</DbHead>
                    <DbHead className={`${th} text-right`}>Rows</DbHead>
                  </DbRow>
                </DbHeader>
                <DbBody>
                  {loaded.files.map((f) => (
                    <DbRow key={`${f.id}-${f.name}`} className="hover:bg-[var(--bg-subtle)]">
                      <DbCell className={`${td} font-mono`}>{f.name}</DbCell>
                      <DbCell className={td}>{kindName[f.kind] ?? f.kind}</DbCell>
                      <DbCell className={`${td} num text-right`}>{f.rows.toLocaleString("en-GB")}</DbCell>
                    </DbRow>
                  ))}
                </DbBody>
              </Db>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setResults(null);
                  setDone(null);
                  clear();
                }}
              >
                Clear and start again
              </Button>
              <span className="text-sm text-[var(--ink-tertiary)]">Removes the uploaded results from this tab. Nothing else is deleted.</span>
            </div>
          </>
        ) : (
          <EmptyState title="Nothing loaded." body="Upload one or more files below." />
        )}
      </Section>

      <Section title="Choose files" note="CSV logs, the key register (.json) and an optional case-facts file (.json).">
        <label className="flex cursor-pointer flex-col items-start gap-2 rounded-lg border border-dashed border-border p-6 text-sm hover:bg-[var(--bg-subtle)] focus-within:outline-2 focus-within:outline-[var(--signal)]">
          <span className="font-medium">Select files</span>
          <span className="text-muted-foreground">You can pick several at once.</span>
          <input type="file" name="logs" multiple accept=".csv,.json" className="visually-hidden" onChange={(e) => onFiles(e.target.files)} />
        </label>
        {busy ? (
          <p role="status" className="text-sm text-muted-foreground">
            Reading the files
          </p>
        ) : null}
        {!results && !busy ? <EmptyState title="No files checked yet." body="Pick one or more files and the check appears here." /> : null}
        {results ? (
          <>
            <div className="overflow-x-auto">
              <Db className="min-w-[40rem]">
                <DbHeader>
                  <DbRow className="hover:bg-transparent">
                    <DbHead className={th}>File</DbHead>
                    <DbHead className={th}>Size</DbHead>
                    <DbHead className={th}>Check</DbHead>
                    <DbHead className={th}>Detail</DbHead>
                  </DbRow>
                </DbHeader>
                <DbBody>
                  {results.map((r) => (
                    <DbRow key={r.file.name} className="hover:bg-[var(--bg-subtle)]">
                      <DbCell className={`${td} font-mono`}>{r.file.name}</DbCell>
                      <DbCell className={`${td} num text-muted-foreground`}>{r.size}</DbCell>
                      <DbCell className={td}>
                        <Tag color={r.color}>{r.label}</Tag>
                      </DbCell>
                      <DbCell className={`${td} whitespace-normal`}>{r.detail}</DbCell>
                    </DbRow>
                  ))}
                </DbBody>
              </Db>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={run} disabled={okCount === 0 || running}>
                <Play aria-hidden="true" />
                {running ? "Running the detector" : `Run the detector on ${okCount} file${okCount === 1 ? "" : "s"}`}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setResults(null);
                  setDone(null);
                }}
              >
                Clear the selection
              </Button>
            </div>
          </>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-[var(--tp)]">
            {error}
          </p>
        ) : null}
        {done ? (
          <Callout icon={Info}>
            <p className="font-medium">Done. The whole app now shows what you uploaded.</p>
            <p className="mt-1">
              {done.stats.events.toLocaleString("en-GB")} events read, {done.alerts.filter((a) => a.status !== "ordinary").length} alert groups, {done.bank.filter((b) => b.hold).length} suppliers on hold.
            </p>
            <Link href="/alerts" className={cn(buttonVariants({ variant: "outline" }), "mt-3 w-fit")}>
              Open the alerts
            </Link>
          </Callout>
        ) : null}
      </Section>
    </PageShell>
  );
}
