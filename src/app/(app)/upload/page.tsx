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
import { cn } from "@/lib/utils";
import type { Analysis } from "@/engine/types";

const expected: Record<string, { name: string; columns: string[] }> = {
  E01: { name: "LedgerOne API log", columns: ["ts_utc", "request_id", "api_key_id", "caller_ip", "user_agent", "endpoint", "method", "records_returned", "status"] },
  E02: { name: "HelpDeskr audit log", columns: ["ts_local", "event_id", "actor", "actor_type", "action", "object_id", "source_ip", "result", "details"] },
  E03: { name: "Sign-in log", columns: ["ts_utc", "event_id", "user", "source_ip", "city", "auth_method", "mfa_result", "device_id", "result", "failure_reason"] },
  E05: { name: "BlueVault access log", columns: ["epoch_s", "event_id", "principal", "source_ip", "action", "path", "bytes", "result"] },
  E15: { name: "Private-link flow log", columns: ["ts_utc", "flow_id", "src_ip", "src_label", "dst_system", "dst_port", "bytes_out", "bytes_in", "tunnel_id", "result"] },
  E18: { name: "LedgerOne API log, 1 to 7 Sep", columns: ["ts_utc", "request_id", "api_key_id", "caller_ip", "user_agent", "endpoint", "method", "records_returned", "status"] },
  E19: { name: "Vendor change log", columns: ["ts_utc", "change_id", "vendor_id", "vendor_name", "field", "old_value", "new_value", "changed_by", "channel", "approval_ref", "source_ip", "request_id"] },
};

interface Checked {
  file: File;
  size: string;
  label: string;
  color: TagColor;
  detail: string;
  ok: boolean;
}

async function check(file: File): Promise<Checked> {
  const size = file.size > 1e6 ? `${(file.size / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1e3))} KB`;
  const id = /^E(\d{2})/i.exec(file.name)?.[0].toUpperCase();
  const spec = id ? expected[id] : undefined;
  if (!spec) return { file, size, label: "Not recognised", color: "yellow", detail: "Name the file with its evidence number, for example E01_ledgerone_api_access.csv.", ok: false };
  const head = (await file.slice(0, 4096).text()).split(/\r?\n/)[0].split(",").map((c) => c.trim());
  const missing = spec.columns.filter((c) => !head.includes(c));
  if (missing.length === 0) return { file, size, label: "Columns match", color: "green", detail: `${id} ${spec.name}: all ${spec.columns.length} columns found.`, ok: true };
  return { file, size, label: "Wrong columns", color: "red", detail: `${id} ${spec.name}: missing ${missing.join(", ")}.`, ok: false };
}

export default function UploadPage() {
  const { replace, reload } = useAnalysis();
  const [results, setResults] = useState<Checked[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Analysis | null>(null);

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
    <PageShell icon={FileUp} title="Upload logs" lead="Check a new set of logs against the columns the detector expects, then run it. Everything else in the app updates to match.">
      <Callout icon={Info}>
        <p>Logs you do not upload fall back to the supplied evidence. Files are analysed on the server and not stored.</p>
      </Callout>

      <Section title="Choose files" note="CSV logs named by evidence number: E01, E02, E03, E05, E15, E18, E19.">
        <label className="flex cursor-pointer flex-col items-start gap-2 rounded-lg border border-dashed border-border p-6 text-sm hover:bg-[var(--bg-subtle)] focus-within:outline-2 focus-within:outline-[var(--signal)]">
          <span className="font-medium">Select log files</span>
          <span className="text-muted-foreground">You can pick several at once.</span>
          <input type="file" name="logs" multiple accept=".csv" className="visually-hidden" onChange={(e) => onFiles(e.target.files)} />
        </label>
        {busy ? <p role="status" className="text-sm text-muted-foreground">Reading the files</p> : null}
        {!results && !busy ? <EmptyState title="No files checked yet." body="Pick one or more CSV logs and the column check appears here." /> : null}
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
                    <DbRow key={r.file.name} className="hover:bg-paper-2">
                      <DbCell className={`${td} font-mono`}>{r.file.name}</DbCell>
                      <DbCell className={`${td} num text-muted-foreground`}>{r.size}</DbCell>
                      <DbCell className={td}>
                        <Tag color={r.color}>{r.label}</Tag>
                      </DbCell>
                      <DbCell className={`${td} whitespace-normal text-ink-2`}>{r.detail}</DbCell>
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
              <Button variant="outline" onClick={() => { setResults(null); setDone(null); reload(); }}>
                Back to the supplied evidence
              </Button>
            </div>
          </>
        ) : null}
        {error ? <p role="alert" className="text-sm text-error">{error}</p> : null}
        {done ? (
          <Callout icon={Info}>
            <p className="font-medium">Done. The whole app now shows your logs.</p>
            <p className="mt-1">
              {done.stats.events.toLocaleString("en-GB")} events read, {done.alerts.filter((a) => a.status !== "ordinary").length} alert groups,{" "}
              {done.bank.filter((b) => b.hold).length} suppliers on hold.
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
