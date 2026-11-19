"use client";

import { Suspense, useMemo } from "react";
import { Search, TriangleAlert } from "lucide-react";
import { PageShell, Properties } from "@/components/page-shell";
import { Tag, severityColor, severityLabel, type TagColor } from "@/components/tag";
import { EvidenceTags } from "@/components/evidence-tags";
import { Db, DbBody, DbCell, DbHead, DbHeader, DbRow, td, th } from "@/components/db";
import { EmptyState, ErrorState, PageSkeleton, TableSkeleton } from "@/components/states";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSlice } from "@/components/analysis-provider";
import { fmtRange } from "@/lib/format";
import { useQueryState } from "@/lib/use-query-state";
import type { Alert, AlertStatus } from "@/lib/types";

const statusLabel: Record<AlertStatus, string> = { open: "Open", review: "Needs review", ordinary: "Ordinary" };
const statusColor: Record<AlertStatus, TagColor> = { open: "red", review: "yellow", ordinary: "gray" };
const severityItems = [
  { value: "all", label: "Any severity" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

function AlertsView() {
  const { state, retry } = useSlice((a) => a.alerts);
  const [view, setView] = useQueryState("view", "flagged");
  const [severity, setSeverity] = useQueryState("severity", "all");
  const [query, setQuery] = useQueryState("q", "");
  const [openId, setOpenId] = useQueryState("open", "");

  const alerts = useMemo(() => (state.status === "ready" ? state.data : []), [state]);
  const counts = useMemo(
    () => ({
      flagged: alerts.filter((a) => a.status !== "ordinary").length,
      ordinary: alerts.filter((a) => a.status === "ordinary").length,
      all: alerts.length,
    }),
    [alerts],
  );

  const rows = useMemo(
    () =>
      alerts.filter((a) => {
        if (view === "flagged" && a.status === "ordinary") return false;
        if (view === "ordinary" && a.status !== "ordinary") return false;
        if (severity !== "all" && a.severity !== severity) return false;
        const q = query.trim().toLowerCase();
        return !q || `${a.title} ${a.key} ${a.source} ${a.system}`.toLowerCase().includes(q);
      }),
    [alerts, view, severity, query],
  );
  const selected: Alert | undefined = alerts.find((a) => a.id === openId);

  const clear = () => {
    setSeverity("all");
    setQuery("");
  };

  return (
    <PageShell icon={TriangleAlert} title="Alerts" lead="Events that left a key's usual pattern, grouped by what the actor did. Ordinary events are listed so nobody has to guess.">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={view} onValueChange={(v) => setView(String(v))}>
            <TabsList variant="line">
              <TabsTrigger value="flagged">Flagged {state.status === "ready" ? counts.flagged : ""}</TabsTrigger>
              <TabsTrigger value="ordinary">Ordinary {state.status === "ready" ? counts.ordinary : ""}</TabsTrigger>
              <TabsTrigger value="all">All {state.status === "ready" ? counts.all : ""}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                aria-label="Search alerts"
                name="q"
                type="search"
                autoComplete="off"
                placeholder="Search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-44 pl-8"
              />
            </div>
            <Select value={severity} onValueChange={(v) => setSeverity(String(v))} items={severityItems}>
              <SelectTrigger size="default" aria-label="Filter by severity" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {severityItems.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {state.status === "loading" ? <TableSkeleton rows={8} /> : null}
        {state.status === "error" ? <ErrorState what="alerts" message={state.message} onRetry={retry} /> : null}
        {state.status === "ready" && rows.length === 0 ? (
          <EmptyState title="No alerts match these filters." body="Widen the severity or clear the search to see every group in this view." action={{ label: "Clear filters", onClick: clear }} />
        ) : null}
        {state.status === "ready" && rows.length > 0 ? (
          <div className="overflow-x-auto">
            <Db className="min-w-[56rem]">
              <DbHeader>
                <DbRow className="hover:bg-transparent">
                  <DbHead className={th}>Alert</DbHead>
                  <DbHead className={th}>Severity</DbHead>
                  <DbHead className={th}>System</DbHead>
                  <DbHead className={th}>Key</DbHead>
                  <DbHead className={th}>When</DbHead>
                  <DbHead className={`${th} text-right`}>Events</DbHead>
                  <DbHead className={th}>Status</DbHead>
                </DbRow>
              </DbHeader>
              <DbBody>
                {rows.map((a) => (
                  <DbRow key={a.id} className="cursor-pointer hover:bg-paper-2" onClick={() => setOpenId(a.id)}>
                    <DbCell className={`${td} min-w-56 whitespace-normal`}>
                      <button type="button" className="text-left font-medium underline-offset-4 hover:underline active:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50" onClick={() => setOpenId(a.id)}>
                        {a.title}
                      </button>
                    </DbCell>
                    <DbCell className={td}>
                      <Tag color={severityColor[a.severity]}>{severityLabel[a.severity]}</Tag>
                    </DbCell>
                    <DbCell className={td}>{a.system}</DbCell>
                    <DbCell className={`${td} font-mono`}>{a.key}</DbCell>
                    <DbCell className={`${td} num whitespace-nowrap text-muted-foreground`}>{fmtRange(a.start, a.end)}</DbCell>
                    <DbCell className={`${td} num text-right`}>{a.count}</DbCell>
                    <DbCell className={td}>
                      <Tag color={statusColor[a.status]}>{statusLabel[a.status]}</Tag>
                    </DbCell>
                  </DbRow>
                ))}
              </DbBody>
            </Db>
          </div>
        ) : null}
      </div>

      <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && setOpenId("")}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle className="text-xl font-semibold">{selected.title}</SheetTitle>
                <SheetDescription>{fmtRange(selected.start, selected.end)}</SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-6 px-4 pb-8">
                <Properties
                  items={[
                    { icon: TriangleAlert, label: "Severity", value: <Tag color={severityColor[selected.severity]}>{severityLabel[selected.severity]}</Tag> },
                    { icon: Search, label: "Status", value: <Tag color={statusColor[selected.status]}>{statusLabel[selected.status]}</Tag> },
                    { icon: Search, label: "System", value: <span>{selected.system}</span> },
                    { icon: Search, label: "Key or user", value: <span className="font-mono">{selected.key}</span> },
                    { icon: Search, label: "Source", value: <span className="font-mono">{selected.source}</span> },
                    { icon: Search, label: "Events", value: <span className="num">{selected.count}</span> },
                  ]}
                />
                <div>
                  <h3>Why it was flagged</h3>
                  <p className="mt-1 text-sm text-ink-2">{selected.rule}</p>
                </div>
                <div>
                  <h3>What normal looks like</h3>
                  <p className="mt-1 text-sm text-ink-2">{selected.normal}</p>
                </div>
                <div>
                  <h3>Evidence</h3>
                  <div className="mt-2">
                    <EvidenceTags items={selected.evidence} />
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}

export default function AlertsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AlertsView />
    </Suspense>
  );
}
