"use client";

import { Suspense, useMemo } from "react";
import { History } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { EmptyState, ErrorState, PageSkeleton, TableSkeleton } from "@/components/states";
import { TimelineTable, phaseLabel } from "@/components/timeline-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSlice } from "@/components/analysis-provider";
import { useQueryState } from "@/lib/use-query-state";
import type { TimelineKind } from "@/lib/types";

const phaseItems = [{ value: "all", label: "Every phase" }, ...(Object.keys(phaseLabel) as TimelineKind[]).map((k) => ({ value: k, label: phaseLabel[k] }))];

function TimelineView() {
  const { state, retry } = useSlice((a) => a.timeline);
  const [phase, setPhase] = useQueryState("phase", "all");
  const rows = useMemo(() => (state.status === "ready" ? state.data.filter((e) => phase === "all" || e.kind === phase) : []), [state, phase]);

  return (
    <PageShell icon={History} title="Timeline" lead="One timeline across five systems, with the clocks converted to UTC. HelpDeskr logs India time and BlueVault logs a clock that was never synchronised.">
      <div className="flex flex-col gap-3">
        <Select value={phase} onValueChange={(v) => setPhase(String(v))} items={phaseItems}>
          <SelectTrigger aria-label="Filter by phase" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {phaseItems.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {state.status === "loading" ? <TableSkeleton rows={8} /> : null}
        {state.status === "error" ? <ErrorState what="timeline" message={state.message} onRetry={retry} /> : null}
        {state.status === "ready" && rows.length === 0 ? <EmptyState title="No events in this phase." body="Choose another phase to see its events." action={{ label: "Show every phase", onClick: () => setPhase("all") }} /> : null}
        {state.status === "ready" && rows.length > 0 ? <TimelineTable events={rows} /> : null}
      </div>
    </PageShell>
  );
}

export default function TimelinePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TimelineView />
    </Suspense>
  );
}
