"use client";

import { Suspense } from "react";
import { FlaskConical, Info } from "lucide-react";
import { Callout, PageShell, Section } from "@/components/page-shell";
import { Tag, type TagColor } from "@/components/tag";
import { Db, DbBody, DbCell, DbHead, DbHeader, DbRow, td, th } from "@/components/db";
import { EmptyState, ErrorState, PageSkeleton, TableSkeleton } from "@/components/states";
import { SeleniumPanel } from "@/components/selenium-panel";
import { useSlice } from "@/components/analysis-provider";
import { fmtTime } from "@/lib/format";

const stopColor: Record<string, TagColor> = { yes: "green", no: "red", "cannot tell": "yellow" };
const stopLabel: Record<string, string> = { yes: "Stops it", no: "Does not stop it", "cannot tell": "Cannot tell" };

function SimulationView() {
  const { state, retry } = useSlice((a) => a.simulation);

  return (
    <PageShell
      icon={FlaskConical}
      title="Simulation"
      always={<SeleniumPanel />}
      lead="The attack replayed through the defense. When would each layer have fired, and which single controls would have stopped the bank change?"
    >
      {state.status === "loading" ? <TableSkeleton rows={6} /> : null}
      {state.status === "error" ? <ErrorState what="simulation" message={state.message} onRetry={retry} /> : null}
      {state.status === "ready" && state.data === null ? (
        <EmptyState title="No simulation for these logs." body="The replay needs to know which events are the attack. Upload a case-facts file with the attacker address ranges together with the logs and this page replays the defense against them." />
      ) : null}
      {state.status === "ready" && state.data ? (
        <>
          <Section title="When the defense would have fired" note={`${state.data.attackerEvents} attacker events, replayed in time order against the frozen baseline.`}>
            <div className="overflow-x-auto">
              <Db className="min-w-[48rem]">
                <DbHeader>
                  <DbRow className="hover:bg-transparent">
                    <DbHead className={th}>When (UTC)</DbHead>
                    <DbHead className={th}>What fired</DbHead>
                    <DbHead className={`${th} text-right`}>Days before the change</DbHead>
                  </DbRow>
                </DbHeader>
                <DbBody>
                  {state.data.milestones.map((m) => (
                    <DbRow key={`${m.when}-${m.label}`} className="hover:bg-paper-2">
                      <DbCell className={`${td} num whitespace-nowrap text-muted-foreground`}>{fmtTime(m.when)}</DbCell>
                      <DbCell className={`${td} whitespace-normal`}>
                        <span className="font-medium">{m.label}</span>
                        <span className="block text-muted-foreground">{m.detail}</span>
                      </DbCell>
                      <DbCell className={`${td} num text-right`}>{m.daysBeforeChange === 0 ? "at the change" : m.daysBeforeChange.toFixed(1)}</DbCell>
                    </DbRow>
                  ))}
                </DbBody>
              </Db>
            </div>
          </Section>

          <Section title="Which controls would have stopped it" note="Each control tested alone, as if it had been in place from the start of the logs.">
            <div className="overflow-x-auto">
              <Db className="min-w-[56rem]">
                <DbHeader>
                  <DbRow className="hover:bg-transparent">
                    <DbHead className={th}>Control</DbHead>
                    <DbHead className={`${th} text-right`}>Attacker events blocked</DbHead>
                    <DbHead className={th}>Bank change</DbHead>
                    <DbHead className={th}>Why</DbHead>
                  </DbRow>
                </DbHeader>
                <DbBody>
                  {state.data.controls.map((c) => (
                    <DbRow key={c.name} className="hover:bg-paper-2">
                      <DbCell className={`${td} w-64 whitespace-normal`}>
                        <span className="font-medium">{c.name}</span>
                        <span className="block text-muted-foreground">{c.how}</span>
                      </DbCell>
                      <DbCell className={`${td} num text-right`}>
                        {c.blocked} <span className="text-muted-foreground">({c.share}%)</span>
                      </DbCell>
                      <DbCell className={td}>
                        <Tag color={stopColor[c.stopsBankChange]}>{stopLabel[c.stopsBankChange]}</Tag>
                      </DbCell>
                      <DbCell className={`${td} min-w-56 whitespace-normal text-ink-2`}>{c.note}</DbCell>
                    </DbRow>
                  ))}
                </DbBody>
              </Db>
            </div>
          </Section>

          <Section title="How fast must the response be?" note="The detector alerts, then a person revokes the key after the delay shown.">
            <div className="overflow-x-auto">
              <Db className="min-w-[36rem]">
                <DbHeader>
                  <DbRow className="hover:bg-transparent">
                    <DbHead className={th}>Revoke after</DbHead>
                    <DbHead className={`${th} text-right`}>Attacker events prevented</DbHead>
                    <DbHead className={th}>Bank change</DbHead>
                  </DbRow>
                </DbHeader>
                <DbBody>
                  {state.data.sensitivity.map((r) => (
                    <DbRow key={r.delay} className="hover:bg-paper-2">
                      <DbCell className={td}>{r.delay}</DbCell>
                      <DbCell className={`${td} num text-right`}>
                        {r.prevented} <span className="text-muted-foreground">({r.share}%)</span>
                      </DbCell>
                      <DbCell className={td}>
                        <Tag color={r.stopsBankChange ? "green" : "red"}>{r.stopsBankChange ? "Stops it" : "Does not stop it"}</Tag>
                      </DbCell>
                    </DbRow>
                  ))}
                </DbBody>
              </Db>
            </div>
          </Section>

          <Callout icon={Info}>
            <p className="font-medium">Assumptions</p>
            <ul className="mt-1 list-disc pl-5">
              {state.data.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </Callout>
        </>
      ) : null}
    </PageShell>
  );
}

export default function SimulationPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SimulationView />
    </Suspense>
  );
}
