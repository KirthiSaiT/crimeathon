"use client";

import { Suspense } from "react";
import { ChevronRight, KeyRound } from "lucide-react";
import { PageShell, Section } from "@/components/page-shell";
import { Tag, type TagColor } from "@/components/tag";
import { Db, DbBody, DbCell, DbHead, DbHeader, DbRow, td, th } from "@/components/db";
import { ErrorState, PageSkeleton, TableSkeleton } from "@/components/states";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useSlice } from "@/components/analysis-provider";
import { fmtDate } from "@/lib/format";

const riskColor: Record<string, TagColor> = { High: "red", Medium: "yellow", Low: "green" };

function KeysView() {
  const { state, retry } = useSlice((a) => a.keys);

  return (
    <PageShell
      icon={KeyRound}
      title="Keys"
      lead="Every key in the connected software register, scored against the company's own policy (E10). The three used in the incident are marked."
    >
      <Section title="Register" note="Current state as exported on 2 Sep 2026. The register keeps no history.">
        {state.status === "loading" ? <TableSkeleton rows={8} /> : null}
        {state.status === "error" ? <ErrorState what="key register" message={state.message} onRetry={retry} /> : null}
        {state.status === "ready" ? (
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
                    </CollapsibleContent>
                  </Collapsible>
                </li>
              ))}
          </ol>
        ) : null}
      </Section>
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
