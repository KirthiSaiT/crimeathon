"use client";

import Link from "next/link";
import { Suspense } from "react";
import { motion } from "framer-motion";
import { Calendar, FileStack, Info, KeyRound, Landmark, ShieldCheck, TriangleAlert } from "lucide-react";
import { StaggerGroup } from "@/components/aceternity/reveal";
import { SpotlightCard } from "@/components/aceternity/spotlight-card";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { springDefault } from "@/lib/spring";
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

  return (
    <PageShell
      icon={KeyRound}
      title="Stolen keys, one bank change"
      lead="See which machine keys acted off their usual pattern, and hold supplier bank changes that carry no approval."
      aurora
    >
      {state.status === "ready" ? (
        <StaggerGroup className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Alert groups flagged", value: state.data[2].filter((a) => a.status !== "ordinary").length, tone: "var(--tp)" },
            { label: "Ordinary events set aside", value: state.data[2].filter((a) => a.status === "ordinary").length, tone: "var(--fp)" },
            { label: "Suppliers on hold", value: state.data[1].filter((b) => b.hold).length, tone: "var(--nr)" },
            { label: "Evidence files read", value: 20, tone: "var(--accent)" },
          ].map((k) => (
            <motion.div key={k.label} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: springDefault } }}>
              <SpotlightCard spotlightColor={k.tone} className="p-5">
                <div className="text-4xl font-semibold tracking-[var(--track-display)]" style={{ color: k.tone }}>
                  <AnimatedCounter value={k.value} />
                </div>
                <div className="mt-1 text-sm text-[var(--ink-secondary)]">{k.label}</div>
              </SpotlightCard>
            </motion.div>
          ))}
        </StaggerGroup>
      ) : null}

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
                  <Tag color="red">{state.data[2].filter((a) => a.status !== "ordinary").length} alert groups</Tag>
                  <Tag color="gray">{state.data[2].filter((a) => a.status === "ordinary").length} ordinary events set aside</Tag>
                </>
              ) : (
                <span className="text-muted-foreground">Loading</span>
              ),
          },
          {
            icon: Landmark,
            label: "Next payment runs",
            value: (
              <>
                <span>8th and 23rd</span>
                {state.status === "ready" ? <Tag color="orange">{state.data[1].filter((b) => b.hold).length} suppliers on hold</Tag> : null}
              </>
            ),
          },
        ]}
      />

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
        {state.status === "ready" ? (
          <TimelineTable events={state.data[0].filter((e) => events === "all" || e.kind !== "context")} />
        ) : null}
      </Section>

      <Section title="Hold queue" note="Suppliers whose bank change should be confirmed by a call-back before the next run.">
        {state.status === "loading" ? <TableSkeleton rows={2} /> : null}
        {state.status === "ready" ? (
          <ul className="divide-y divide-[var(--line)]/70 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)]">
            {state.data[1]
              .filter((b) => b.hold)
              .map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">{b.vendor}</span>
                    <span className="ml-2 font-mono text-muted-foreground">{b.vendorId}</span>
                    <span className="mt-0.5 block text-muted-foreground">{b.why}</span>
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
