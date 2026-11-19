"use client";

import { Suspense, useState } from "react";
import { ClipboardList } from "lucide-react";
import { PageShell, Section } from "@/components/page-shell";
import { Tag } from "@/components/tag";
import { Db, DbBody, DbCell, DbHead, DbHeader, DbRow, td, th } from "@/components/db";
import { EmptyState, ErrorState, PageSkeleton, TableSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAnalysis } from "@/components/analysis-provider";
import { useAuth } from "@/components/role-provider";
import { useAuditLog, useRuns } from "@/lib/supabase/data";
import { useSecretAlerts } from "@/lib/supabase/tickets";
import { fmtTime } from "@/lib/format";

const actionText: Record<string, string> = {
  hold_released: "Released a bank hold",
  alert_insert: "Reviewed an alert",
  alert_update: "Changed an alert review",
  key_insert: "Requested a key action",
  key_update: "Updated a key action",
  release_requested: "Requested a hold release",
  secret_blocked: "A ticket with a secret was refused",
  secret_masked: "A ticket with a secret was raised, masked",
  role_changed: "Changed a role",
  setting_changed: "Changed a setting",
};

function ActivityView() {
  const { state } = useAnalysis();
  const { status: authStatus, role, configured, can } = useAuth();
  const { runs, error: runError, save } = useRuns();
  const { rows: audit, error: auditError } = useAuditLog();
  const secrets = useSecretAlerts();
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const signedIn = authStatus === "signed-in";
  const canSave = can("save_run") && state.status === "ready" && state.data.files.length > 0;

  const saveRun = async () => {
    if (state.status !== "ready") return;
    setSaving(true);
    setFailure(null);
    setSaved(false);
    const message = await save(state.data, label.trim());
    setSaving(false);
    if (message) setFailure(message);
    else {
      setSaved(true);
      setLabel("");
    }
  };

  return (
    <PageShell icon={ClipboardList} title="Activity" lead="Detector runs saved to the database, and a record of who released a hold, reviewed an alert or asked for a key action.">
      {!configured ? (
        <EmptyState title="The database is not configured." body="Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to save runs and keep an audit trail." />
      ) : !signedIn ? (
        <EmptyState title={authStatus === "loading" ? "Checking sign-in." : "Sign in to see saved runs and the audit log."} body="The database only answers signed-in visitors. The rest of the app stays readable without an account." />
      ) : (
        <>
          {secrets.allowed ? (
            <Section title="Secret alerts" note="Someone tried to put a secret into a ticket. The text was not saved. If it was a live vault key, it was replaced at once.">
              {secrets.error ? <ErrorState what="secret alerts" message={secrets.error} onRetry={() => window.location.reload()} /> : null}
              {!secrets.error && secrets.alerts === null ? <TableSkeleton rows={2} /> : null}
              {secrets.alerts && secrets.alerts.length === 0 ? <EmptyState title="No alerts." body="Nobody has tried to put a secret into a ticket." /> : null}
              {secrets.alerts && secrets.alerts.length > 0 ? (
                <div className="overflow-x-auto">
                  <Db className="min-w-[56rem]">
                    <DbHeader>
                      <DbRow className="hover:bg-transparent">
                        <DbHead className={th}>When (UTC)</DbHead>
                        <DbHead className={th}>Who</DbHead>
                        <DbHead className={th}>Where</DbHead>
                        <DbHead className={th}>What it looked like</DbHead>
                        <DbHead className={th}>Outcome</DbHead>
                        <DbHead className={th}>Review</DbHead>
                      </DbRow>
                    </DbHeader>
                    <DbBody>
                      {secrets.alerts.map((a) => (
                        <DbRow key={a.id} className="hover:bg-[var(--bg-subtle)]">
                          <DbCell className={`${td} num whitespace-nowrap`}>{fmtTime(a.at)}</DbCell>
                          <DbCell className={`${td} whitespace-normal`}>{a.actor_email ?? "unknown"}</DbCell>
                          <DbCell className={`${td} whitespace-normal`}>{a.action === "ticket.create" ? "New ticket" : `Comment on TKT-${a.ticket_id ?? "?"}`}</DbCell>
                          <DbCell className={`${td} whitespace-normal`}>
                            <span className="flex flex-wrap gap-1">
                              {a.patterns.map((p, i) => (
                                <Tag key={`${p}-${i}`} color="red">
                                  {p}: <span className="font-mono">{a.previews[i]}</span>
                                </Tag>
                              ))}
                            </span>
                          </DbCell>
                          <DbCell className={`${td} whitespace-normal`}>
                            {a.overridden ? <Tag color="yellow">Raised masked by a reviewer</Tag> : <Tag color="green">Refused</Tag>}
                            {a.rotated_keys.length > 0 ? <Tag color="blue">Key rotated: {a.rotated_keys.join(", ")}</Tag> : null}
                            {a.override_reason ? <span className="mt-1 block text-[var(--ink-tertiary)]">{a.override_reason}</span> : null}
                          </DbCell>
                          <DbCell className={td}>
                            {a.status === "open" ? (
                              <Button size="xs" variant="outline" onClick={async () => setFailure(await secrets.review(a.id, ""))}>
                                Mark reviewed
                              </Button>
                            ) : (
                              <Tag color="gray">Reviewed</Tag>
                            )}
                          </DbCell>
                        </DbRow>
                      ))}
                    </DbBody>
                  </Db>
                </div>
              ) : null}
            </Section>
          ) : null}

          <Section title="Save this run" note="Stores the current result, whether from the supplied evidence or from the logs you uploaded.">
            <div className="flex max-w-xl flex-wrap items-end gap-3">
              <label className="flex min-w-56 flex-1 flex-col gap-1.5 text-sm">
                Label (optional)
                <Input name="run-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
              </label>
              <Button disabled={!canSave || saving} onClick={() => void saveRun()}>
                {saving ? "Saving" : "Save this run"}
              </Button>
            </div>
            {!can("save_run") ? <p className="text-sm text-[var(--ink-tertiary)]">Your role ({role}) cannot save runs. An administrator can give you the analyst role.</p> : null}
            {failure ? (
              <p role="alert" className="text-sm text-[var(--tp)]">
                {failure}
              </p>
            ) : null}
            {saved ? <p className="text-sm text-[var(--fp)]">Run saved.</p> : null}
          </Section>

          <Section title="Saved runs" note="Newest first.">
            {runError ? <ErrorState what="saved runs" message={runError} onRetry={() => window.location.reload()} /> : null}
            {!runError && runs === null ? <TableSkeleton rows={3} /> : null}
            {runs && runs.length === 0 ? <EmptyState title="No runs saved yet." body="Save the current run above and it appears here." /> : null}
            {runs && runs.length > 0 ? (
              <div className="overflow-x-auto">
                <Db className="min-w-[40rem]">
                  <DbHeader>
                    <DbRow className="hover:bg-transparent">
                      <DbHead className={th}>Saved (UTC)</DbHead>
                      <DbHead className={th}>Label</DbHead>
                      <DbHead className={th}>Source</DbHead>
                      <DbHead className={`${th} text-right`}>Events</DbHead>
                      <DbHead className={`${th} text-right`}>Flagged</DbHead>
                    </DbRow>
                  </DbHeader>
                  <DbBody>
                    {runs.map((r) => (
                      <DbRow key={r.id} className="hover:bg-[var(--bg-subtle)]">
                        <DbCell className={`${td} num whitespace-nowrap`}>{fmtTime(r.created_at)}</DbCell>
                        <DbCell className={`${td} whitespace-normal`}>{r.label || <span className="text-[var(--ink-tertiary)]">No label</span>}</DbCell>
                        <DbCell className={td}>
                          <Tag>{r.source === "supplied" ? "Supplied evidence" : "Uploaded logs"}</Tag>
                        </DbCell>
                        <DbCell className={`${td} num text-right`}>{r.stats.events.toLocaleString("en-GB")}</DbCell>
                        <DbCell className={`${td} num text-right`}>{r.stats.flagged}</DbCell>
                      </DbRow>
                    ))}
                  </DbBody>
                </Db>
              </div>
            ) : null}
          </Section>

          {can("view_audit") ? (
            <Section title="Audit log" note="Written by the database itself, so it cannot be skipped by the app. Newest first.">
              {auditError ? <ErrorState what="audit log" message={auditError} onRetry={() => window.location.reload()} /> : null}
              {!auditError && audit === null ? <TableSkeleton rows={3} /> : null}
              {audit && audit.length === 0 ? <EmptyState title="Nothing recorded yet." body="Releasing a hold, reviewing an alert or requesting a key action adds a row here." /> : null}
              {audit && audit.length > 0 ? (
                <div className="overflow-x-auto">
                  <Db className="min-w-[40rem]">
                    <DbHeader>
                      <DbRow className="hover:bg-transparent">
                        <DbHead className={th}>When (UTC)</DbHead>
                        <DbHead className={th}>What</DbHead>
                        <DbHead className={th}>Subject</DbHead>
                      </DbRow>
                    </DbHeader>
                    <DbBody>
                      {audit.map((a) => (
                        <DbRow key={a.id} className="hover:bg-[var(--bg-subtle)]">
                          <DbCell className={`${td} num whitespace-nowrap`}>{fmtTime(a.at)}</DbCell>
                          <DbCell className={td}>{actionText[a.action] ?? a.action}</DbCell>
                          <DbCell className={`${td} font-mono whitespace-normal break-all`}>{a.subject}</DbCell>
                        </DbRow>
                      ))}
                    </DbBody>
                  </Db>
                </div>
              ) : null}
            </Section>
          ) : null}
        </>
      )}
    </PageShell>
  );
}

export default function ActivityPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ActivityView />
    </Suspense>
  );
}
