"use client";

import { Suspense } from "react";
import { Scale } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { Tag, type TagColor } from "@/components/tag";
import { EvidenceTags } from "@/components/evidence-tags";
import { Db, DbBody, DbCell, DbHead, DbHeader, DbRow, td, th } from "@/components/db";
import { ErrorState, PageSkeleton, TableSkeleton } from "@/components/states";
import { useSlice } from "@/components/analysis-provider";
import type { Verdict } from "@/lib/types";

const verdictLabel: Record<Verdict, string> = { false: "Not supported", unproven: "Unproven", true: "Supported" };
const verdictColor: Record<Verdict, TagColor> = { false: "red", unproven: "yellow", true: "green" };

function ClaimsView() {
  const { state, retry } = useSlice((a) => a.claims);
  return (
    <PageShell
      icon={Scale}
      title="Vendor claims"
      lead="Each statement in TallyBridge's two notices, tested against the company's own logs. A notice says what its author wanted to say; a log says what a system recorded."
    >
      {state.status === "loading" ? <TableSkeleton rows={8} /> : null}
      {state.status === "error" ? <ErrorState what="vendor claims" message={state.message} onRetry={retry} /> : null}
      {state.status === "ready" ? (
        <div className="overflow-x-auto">
          <Db className="min-w-[52rem]">
            <DbHeader>
              <DbRow className="hover:bg-transparent">
                <DbHead className={th}>Claim</DbHead>
                <DbHead className={th}>Verdict</DbHead>
                <DbHead className={th}>What the logs show</DbHead>
                <DbHead className={th}>Evidence</DbHead>
              </DbRow>
            </DbHeader>
            <DbBody>
              {state.data.map((c) => (
                <DbRow key={c.id} className="hover:bg-paper-2">
                  <DbCell className={`${td} w-72 whitespace-normal`}>
                    <span className="font-medium">{c.claim}</span>
                    <span className="mt-1 block text-muted-foreground">{c.source}</span>
                  </DbCell>
                  <DbCell className={td}>
                    <Tag color={verdictColor[c.verdict]}>{verdictLabel[c.verdict]}</Tag>
                  </DbCell>
                  <DbCell className={`${td} min-w-64 whitespace-normal text-ink-2`}>{c.because}</DbCell>
                  <DbCell className={td}>
                    <EvidenceTags items={c.evidence} />
                  </DbCell>
                </DbRow>
              ))}
            </DbBody>
          </Db>
        </div>
      ) : null}
    </PageShell>
  );
}

export default function ClaimsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ClaimsView />
    </Suspense>
  );
}
