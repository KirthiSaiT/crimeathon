"use client";

import { Suspense, useState } from "react";
import { ChevronRight, KeyRound } from "lucide-react";
import { PageShell, Section } from "@/components/page-shell";
import { Tag, type TagColor } from "@/components/tag";
import { Db, DbBody, DbCell, DbHead, DbHeader, DbRow, td, th } from "@/components/db";
import { EmptyState, ErrorState, PageSkeleton, TableSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAnalysis, useSlice } from "@/components/analysis-provider";
import { fmtDate } from "@/lib/format";
import { useAuth } from "@/components/role-provider";
import { useKeyActions, type KeyActionKind } from "@/lib/supabase/data";

const riskColor: Record<string, TagColor> = { High: "red", Medium: "yellow", Low: "green" };
const actionLabel: Record<KeyActionKind, string> = {
  suspend: "Suspend",
  quarantine: "Quarantine (read only)",
  rotate: "Rotate",
  set_expiry: "Set an expiry",
  narrow_scope: "Narrow its scope",
  set_range: "Limit its addresses",
};
const requestable: KeyActionKind[] = ["narrow_scope", "set_range", "rotate", "quarantine", "suspend"];

function KeysView() {
  const { state, retry } = useSlice((a) => a.keys);
  const { state: whole } = useAnalysis();
  const exported = whole.status === "ready" ? whole.data.stats.registerExported : null;
  const { status: authStatus, can } = useAuth();
  const { actions, error: actionError, request, setStatus } = useKeyActions();
  const [failure, setFailure] = useState<string | null>(null);
  const staff = can("request_key_action");
  const approver = can("resolve_key_action");
  const run = async (job: Promise<string | null>) => setFailure(await job);

  return (
    <PageShell
      icon={KeyRound}
      title="Keys"
      lead="Every key in the connected software register, scored against the company's own policy (E10). Keys used in flagged activity are marked."
    >
      <Section title="Register" note={exported ? `Current state as exported on ${fmtDate(exported)}. The register keeps no history.` : "The register keeps no history."}>
        {state.status === "loading" ? <TableSkeleton rows={8} /> : null}
        {state.status === "error" ? <ErrorState what="key register" message={state.message} onRetry={retry} /> : null}
        {state.status === "ready" && state.data.length === 0 ? (
          <EmptyState title="No key register loaded." body="Upload the connected software register (a .json file with an integrations list) on the Upload page to score every key." />
        ) : null}
        {state.status === "ready" && state.data.length > 0 ? (
          <div className="overflow-x-auto">
            <Db className="min-w-[54rem]">
              <DbHeader>
                <DbRow className="hover:bg-transparent">
                  <DbHead className={th}>Key</DbHead>
                  <DbHead className={th}>Scope</DbHead>
                  <DbHead className={th}>Address limit</DbHead>
                  <DbHead className={th}>Expiry</DbHead>
                  <DbHead className={th}>Last review</DbHead>
                  <DbHead className={th}>Last used</DbHead>
                  <DbHead className={th}>Risk</DbHead>
                </DbRow>
              </DbHeader>
              <DbBody>
                {state.data.map((k) => (
                  <DbRow key={k.credential_id} className="hover:bg-paper-2">
                    <DbCell className={`${td} whitespace-normal`}>
                      <span className="font-mono font-medium">{k.credential_id}</span>
                      {k.inIncident ? <Tag color="red" className="ml-2">In the incident</Tag> : null}
                      <span className="block text-muted-foreground">{k.integration}</span>
                    </DbCell>
                    <DbCell className={`${td} font-mono`}>{k.scope}</DbCell>
                    <DbCell className={td}>
                      <Tag color={k.ip_restriction ? "green" : "red"}>{k.ip_restriction ? "Limited" : "None"}</Tag>
                    </DbCell>
                    <DbCell className={td}>
                      <Tag color={k.token_lifetime_days == null ? "red" : k.token_lifetime_days > 90 ? "yellow" : "green"}>
                        {k.token_lifetime_days == null ? "None" : `${k.token_lifetime_days} days`}
                      </Tag>
                    </DbCell>
                    <DbCell className={`${td} num whitespace-nowrap text-muted-foreground`}>{fmtDate(k.last_review)}</DbCell>
                    <DbCell className={`${td} num whitespace-nowrap text-muted-foreground`}>{fmtDate(k.last_used)}</DbCell>
                    <DbCell className={td}>
                      <Tag color={riskColor[k.risk]}>{k.risk}</Tag>
                    </DbCell>
                  </DbRow>
                ))}
              </DbBody>
            </Db>
          </div>
        ) : null}
      </Section>

      <Section title="Rotation queue" note="Highest score first. Each score point comes from a finding and the policy it breaks.">
        {state.status === "loading" ? <TableSkeleton rows={4} /> : null}
        {state.status === "ready" ? (
          <ol className="flex flex-col">
            {state.data
              .filter((k) => k.score >= 4)
              .map((k, i) => (
                <li key={k.credential_id} className="border-b border-border">
                  <Collapsible>
                    <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-sm py-2.5 text-left text-sm hover:bg-paper-2">
                      <ChevronRight className="size-4 text-muted-foreground motion-safe:transition-transform group-data-panel-open:rotate-90" aria-hidden="true" />
                      <span className="num w-5 text-muted-foreground">{i + 1}</span>
                      <span className="font-mono font-medium">{k.credential_id}</span>
                      <span className="text-muted-foreground">{k.findings.length} findings</span>
                      <Tag color={riskColor[k.risk]} className="ml-auto">
                        {k.risk}
                      </Tag>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ul className="flex flex-col gap-1.5 pb-3 pl-11 text-sm">
                        {k.findings.map((f) => (
                          <li key={f.text} className="flex flex-wrap items-center gap-2">
                            <span>{f.text}</span>
                            <Tag mono>{f.policy}</Tag>
                          </li>
                        ))}
                      </ul>
                      {k.advice ? (
                        <div className="mb-3 ml-11 flex max-w-3xl flex-col gap-2 border border-[var(--line)] border-l-[var(--rule-bar)] border-l-[var(--signal)] bg-[var(--bg-elevated)] p-3 text-sm">
                          <p className="font-medium">A narrower key would have done the same job</p>
                          <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5">
                            <dt className="text-[var(--ink-tertiary)]">Allowed today</dt>
                            <dd className="font-mono">{k.scope}</dd>
                            <dt className="text-[var(--ink-tertiary)]">What it did</dt>
                            <dd>{k.advice.used.join(", ")}</dd>
                            <dt className="text-[var(--ink-tertiary)]">Narrow scope</dt>
                            <dd>{k.advice.recommendedScope}</dd>
                            <dt className="text-[var(--ink-tertiary)]">Address range</dt>
                            <dd className="font-mono">{k.advice.recommendedRange ?? "none learned"}</dd>
                          </dl>
                          <p className="text-[var(--ink-secondary)]">{k.advice.note}</p>
                        </div>
                      ) : null}
                      <div className="flex flex-col gap-2 pb-4 pl-11 text-sm">
                        {actions
                          .filter((a) => a.credential_id === k.credential_id)
                          .map((a) => (
                            <p key={a.id} className="flex flex-wrap items-center gap-2">
                              <Tag color={a.status === "done" ? "green" : a.status === "cancelled" ? "gray" : "yellow"}>{a.status === "requested" ? "Requested" : a.status === "done" ? "Done" : "Cancelled"}</Tag>
                              <span>{actionLabel[a.action]}</span>
                              {approver && a.status === "requested" ? (
                                <>
                                  <Button size="xs" variant="outline" onClick={() => void run(setStatus(a.id, "done"))}>
                                    Mark done
                                  </Button>
                                  <Button size="xs" variant="ghost" onClick={() => void run(setStatus(a.id, "cancelled"))}>
                                    Cancel
                                  </Button>
                                </>
                              ) : null}
                            </p>
                          ))}
                        {staff ? (
                          <div className="flex flex-wrap gap-2">
                            {requestable.map((kind) => (
                              <Button key={kind} size="sm" variant="outline" onClick={() => void run(request(k.credential_id, kind, ""))}>
                                Request: {actionLabel[kind].toLowerCase()}
                              </Button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[var(--ink-tertiary)]">{authStatus === "signed-in" ? "Your role cannot request a key action." : "Sign in as an analyst to request a key action."} Warden recommends; a person carries it out.</p>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </li>
              ))}
          </ol>
        ) : null}
      </Section>
      {failure || actionError ? (
        <p role="alert" className="text-sm text-[var(--tp)]">
          {failure ?? actionError}
        </p>
      ) : null}
    </PageShell>
  );
}

export default function KeysPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <KeysView />
    </Suspense>
  );
}
