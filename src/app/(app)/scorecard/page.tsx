"use client";

import { Suspense } from "react";
import { ChartColumn, Info } from "lucide-react";
import { Callout, PageShell, Section } from "@/components/page-shell";
import { Tag } from "@/components/tag";
import { Db, DbBody, DbCell, DbHead, DbHeader, DbRow, td, th } from "@/components/db";
import { EmptyState, ErrorState, PageSkeleton, TableSkeleton } from "@/components/states";
import { useSlice } from "@/components/analysis-provider";
import { fmtTime } from "@/lib/format";

const pct = (n: number, d: number) => (d === 0 ? "none" : `${((n / d) * 100).toFixed(1)}%`);

function ScorecardView() {
  const { state, retry } = useSlice((a) => ({ scorecard: a.scorecard, baseline: a.baseline, stats: a.stats }));
  return (
    <PageShell
      icon={ChartColumn}
      title="Scorecard"
      lead="Correct detections, false alarms and misses from the detector, run live on the logs and on altered copies of them."
    >
      <Section
        title="Accuracy"
        note={state.status === "ready" ? `${state.data.stats.events.toLocaleString("en-GB")} events read. The baseline is frozen at ${fmtTime(state.data.stats.cutoff)} UTC.` : undefined}
      >
        {state.status === "loading" ? <TableSkeleton rows={5} /> : null}
        {state.status === "error" ? <ErrorState what="scorecard" message={state.message} onRetry={retry} /> : null}
        {state.status === "ready" && state.data.scorecard.length === 0 ? (
          <EmptyState
            title="No accuracy figures for these logs."
            body="Accuracy is measured against our own labels of the supplied evidence, which do not apply to new data. The alerts, bank gate and claims still run on your logs. Go back to the supplied evidence to see the scorecard."
          />
        ) : null}
        {state.status === "ready" && state.data.scorecard.length > 0 ? (
          <div className="overflow-x-auto">
            <Db className="min-w-[48rem]">
              <DbHeader>
                <DbRow className="hover:bg-transparent">
                  <DbHead className={th}>Test</DbHead>
                  <DbHead className={`${th} text-right`}>Caught</DbHead>
                  <DbHead className={`${th} text-right`}>False alarms</DbHead>
                  <DbHead className={`${th} text-right`}>Missed</DbHead>
                  <DbHead className={`${th} text-right`}>Left alone</DbHead>
                  <DbHead className={`${th} text-right`}>Caught share</DbHead>
                </DbRow>
              </DbHeader>
              <DbBody>
                {state.data.scorecard.map((r) => (
                  <DbRow key={r.name} className="hover:bg-paper-2">
                    <DbCell className={`${td} whitespace-normal`}>
                      <span className="font-medium">{r.name}</span>
                      <span className="block text-muted-foreground">{r.detail}</span>
                    </DbCell>
                    <DbCell className={`${td} num text-right`}>{r.tp}</DbCell>
                    <DbCell className={`${td} num text-right`}>{r.fp > 0 ? <Tag color="red">{r.fp}</Tag> : r.fp}</DbCell>
                    <DbCell className={`${td} num text-right`}>{r.fn > 0 ? <Tag color="red">{r.fn}</Tag> : r.fn}</DbCell>
                    <DbCell className={`${td} num text-right`}>{r.tn.toLocaleString("en-GB")}</DbCell>
                    <DbCell className={`${td} num text-right`}>{pct(r.tp, r.tp + r.fn)}</DbCell>
                  </DbRow>
                ))}
              </DbBody>
            </Db>
          </div>
        ) : null}
        <Callout icon={Info}>
          <p className="font-medium">Read these numbers with care.</p>
          <p className="mt-1">
            The attacker labels are our own attribution from address ranges, so a clean run shows the rules agree with that reading, not that they will hold on unseen data. The
            baseline must be frozen before the incident: learned from all data, the attacker&apos;s own traffic teaches the detector to ignore the attack.
          </p>
        </Callout>
      </Section>

      <Section title="What the detector learned" note="Each software actor's usual computers and actions, from the data before the cutoff.">
        {state.status === "loading" ? <TableSkeleton rows={6} /> : null}
        {state.status === "ready" ? (
          <div className="overflow-x-auto">
            <Db className="min-w-[48rem]">
              <DbHeader>
                <DbRow className="hover:bg-transparent">
                  <DbHead className={th}>Actor</DbHead>
                  <DbHead className={th}>System</DbHead>
                  <DbHead className={th}>Usual computers</DbHead>
                  <DbHead className={`${th} text-right`}>Usual actions</DbHead>
                </DbRow>
              </DbHeader>
              <DbBody>
                {state.data.baseline.map((b) => (
                  <DbRow key={b.actor} className="hover:bg-paper-2">
                    <DbCell className={`${td} font-mono`}>{b.actor}</DbCell>
                    <DbCell className={td}>{b.system}</DbCell>
                    <DbCell className={`${td} whitespace-normal font-mono text-muted-foreground`}>{b.hosts.join(", ") || "none"}</DbCell>
                    <DbCell className={`${td} num text-right`}>{b.actions.length}</DbCell>
                  </DbRow>
                ))}
              </DbBody>
            </Db>
          </div>
        ) : null}
      </Section>
    </PageShell>
  );
}

export default function ScorecardPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ScorecardView />
    </Suspense>
  );
}
