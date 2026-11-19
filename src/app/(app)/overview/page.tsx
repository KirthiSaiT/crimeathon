"use client";

import Link from "next/link";
import { Suspense } from "react";
import { Calendar, FileStack, Info, KeyRound, Landmark, ShieldCheck, TriangleAlert } from "lucide-react";
import { Callout, PageShell, Properties, Section } from "@/components/page-shell";
import { Tag } from "@/components/tag";
import { TimelineTable } from "@/components/timeline-table";
import { ErrorState, PageSkeleton, TableSkeleton } from "@/components/states";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buttonVariants } from "@/components/ui/button";
import { useSlice } from "@/components/analysis-provider";
import { useQueryState } from "@/lib/use-query-state";
import { cn } from "@/lib/utils";

function OverviewView() {
  const { state, retry } = useSlice((a) => [a.timeline, a.bank, a.alerts] as const);
  const [events, setEvents] = useQueryState("events", "attack");

  const flagged = state.status === "ready" ? state.data[2].filter((a) => a.status !== "ordinary").length : 0;
  const ordinary = state.status === "ready" ? state.data[2].filter((a) => a.status === "ordinary").length : 0;
  const held = state.status === "ready" ? state.data[1].filter((b) => b.hold) : [];

  return (
    <PageShell
      icon={KeyRound}
      title="Stolen keys, one bank change"
      lead="See which machine keys acted off their usual pattern, and hold supplier bank changes that carry no approval."
    >
      {state.status === "ready" ? (
        <dl className="ledger">
          <div className="grid grid-cols-2 gap-px bg-[var(--line)] min-[60rem]:grid-cols-4">
            {[
              { label: "Alert groups flagged", value: flagged },
              { label: "Ordinary events set aside", value: ordinary },
              { label: "Suppliers on hold", value: held.length },
              { label: "Evidence files read", value: 20 },
            ].map((k) => (
              <div key={k.label} className="flex flex-col-reverse justify-end gap-1 bg-[var(--bg-elevated)] px-4 py-4">
                <dt className="text-sm text-[var(--ink-tertiary)]">{k.label}</dt>
                <dd className="num text-3xl leading-none font-bold tracking-[var(--track-display)]">{k.value}</dd>
              </div>
            ))}
          </div>
        </dl>
      ) : null}

      <div className="grid min-w-0 gap-x-10 gap-y-12 min-[60rem]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section title="Hold queue" note="Suppliers whose bank change should be confirmed by a call-back before the next run.">
          {state.status === "loading" ? <TableSkeleton rows={2} /> : null}
          {state.status === "error" ? <ErrorState what="hold queue" message={state.message} onRetry={retry} /> : null}
          {state.status === "ready" ? (
            <ul className="ledger">
              {held.map((b) => (
                <li key={b.id} className="ledger-row flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">{b.vendor}</span>
                    <span className="ml-2 font-mono text-[var(--signal)]">{b.vendorId}</span>
                    <span className="mt-0.5 block text-[var(--ink-tertiary)]">{b.why}</span>
                  </span>
                  <Tag mono>{b.evidence}</Tag>
                </li>
              ))}
            </ul>
          ) : null}
          <Link href="/bank-gate" className={cn(buttonVariants({ variant: "outline" }), "w-fit")}>
            Open the bank gate
          </Link>
        </Section>

        <Section title="Case">
          <Properties
            items={[
              { icon: FileStack, label: "Case", value: <span>CR-26-047, Harbor &amp; Finch Freight</span> },
              { icon: ShieldCheck, label: "Approach", value: <Tag color="blue">Defense</Tag> },
              { icon: Calendar, label: "Records cover", value: <span>1 Jun to 7 Sep 2026, 20 evidence files</span> },
              {
                icon: TriangleAlert,
                label: "Flagged now",
                value:
                  state.status === "ready" ? (
                    <>
                      <Tag color="red">{flagged} alert groups</Tag>
                      <Tag color="gray">{ordinary} ordinary events set aside</Tag>
                    </>
                  ) : (
                    <span className="text-[var(--ink-tertiary)]">Loading</span>
                  ),
              },
              {
                icon: Landmark,
                label: "Next payment runs",
                value: (
                  <>
                    <span>8th and 23rd</span>
                    {state.status === "ready" ? <Tag color="orange">{held.length} suppliers on hold</Tag> : null}
                  </>
                ),
              },
            ]}
          />
        </Section>
      </div>

      <Callout icon={Info}>
        <p>
          <span className="font-medium">Who did it: unknown.</span> The logs point to an outside actor holding keys taken from TallyBridge&apos;s side, and
          that is an inference. No record names a person.
        </p>
      </Callout>

      <Section
        title="Incident timeline"
        note="Every row cites the evidence file and lines it was read from. Times are UTC."
        action={
          <Tabs value={events} onValueChange={(v) => setEvents(String(v))}>
            <TabsList variant="line">
              <TabsTrigger value="attack">Attack path</TabsTrigger>
              <TabsTrigger value="all">All events</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      >
        {state.status === "loading" ? <TableSkeleton rows={7} /> : null}
        {state.status === "error" ? <ErrorState what="timeline" message={state.message} onRetry={retry} /> : null}
        {state.status === "ready" ? <TimelineTable events={state.data[0].filter((e) => events === "all" || e.kind !== "context")} /> : null}
      </Section>
    </PageShell>
  );
}

export default function OverviewPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OverviewView />
    </Suspense>
  );
}
