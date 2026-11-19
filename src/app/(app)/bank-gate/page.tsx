"use client";

import { Suspense, useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Landmark, Lock } from "lucide-react";
import { Callout, PageShell, Section } from "@/components/page-shell";
import { Tag, type TagColor } from "@/components/tag";
import { Db, DbBody, DbCell, DbHead, DbHeader, DbRow, td, th } from "@/components/db";
import { EmptyState, ErrorState, PageSkeleton, TableSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRole } from "@/components/role-provider";
import { useSlice } from "@/components/analysis-provider";
import { fmtTime } from "@/lib/format";
import { useQueryState } from "@/lib/use-query-state";
import type { BankChange, BankStatus } from "@/lib/types";

const statusLabel: Record<BankStatus, string> = { approved: "Approved", missing: "No approval", bulk: "Bulk import", "out-of-sequence": "Out of sequence" };
const statusColor: Record<BankStatus, TagColor> = { approved: "green", missing: "red", bulk: "blue", "out-of-sequence": "orange" };
const STORAGE_KEY = "warden-released";

const releaseListeners = new Set<() => void>();
const subscribeReleased = (cb: () => void) => {
  releaseListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    releaseListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
};
const readReleased = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
};

function useReleased() {
  const raw = useSyncExternalStore(subscribeReleased, readReleased, () => "[]");
  const released = useMemo(() => {
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  }, [raw]);
  const release = useCallback(
    (id: string) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set([...released, id])]));
      } catch {
        // storage unavailable: the hold stays
      }
      releaseListeners.forEach((l) => l());
    },
    [released],
  );
  return { released, release };
}

function BankGateView() {
  const { state, retry } = useSlice((a) => a.bank);
  const { role } = useRole();
  const { released, release } = useReleased();
  const [view, setView] = useQueryState("view", "held");
  const [releasing, setReleasing] = useState<BankChange | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const changes = useMemo(() => (state.status === "ready" ? state.data : []), [state]);
  const held = changes.filter((c) => c.hold);
  const rows = changes.filter((c) => (view === "held" ? c.hold : view === "missing" ? c.status === "missing" : true));
  const canRelease = role === "approver";

  const close = () => {
    setReleasing(null);
    setConfirmed(false);
  };

  return (
    <PageShell
      icon={Landmark}
      title="Bank gate"
      lead="Every supplier bank change, checked for an approval reference. Changes that fail are held for a call-back before the next payment run."
    >
      <Section title="Held for call-back" note="Payments run on the 8th and 23rd. Phone the supplier on a number you already trust.">
        {state.status === "loading" ? <TableSkeleton rows={2} /> : null}
        {state.status === "error" ? <ErrorState what="bank changes" message={state.message} onRetry={retry} /> : null}
        {state.status === "ready" && held.length === 0 ? <EmptyState title="Nothing is held." body="Every bank change has an approval reference in sequence." /> : null}
        {state.status === "ready" && held.length > 0 ? (
          <ul className="flex flex-col">
            {held.map((c) => {
              const isReleased = released.includes(c.id);
              return (
                <li key={c.id} className="flex flex-wrap items-start justify-between gap-4 border-b border-border py-4">
                  <div className="min-w-0 text-sm">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{c.vendor}</span>
                      <span className="font-mono text-muted-foreground">{c.vendorId}</span>
                      <Tag color={statusColor[c.status]}>{statusLabel[c.status]}</Tag>
                      {isReleased ? <Tag color="green">Released</Tag> : <Tag color="red">On hold</Tag>}
                    </p>
                    <p className="mt-1 font-mono text-muted-foreground">
                      {c.oldValue} to {c.newValue}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {c.why} Changed by {c.changedBy} through {c.channel === "API" ? "the API" : c.channel === "UI" ? "the screen" : "a bulk import"} from {c.sourceIp} at {fmtTime(c.time)} UTC.
                    </p>
                    <p className="mt-2">
                      <Tag mono>{c.evidence}</Tag>
                    </p>
                  </div>
                  <Button variant="outline" disabled={!canRelease || isReleased} onClick={() => setReleasing(c)}>
                    {isReleased ? "Hold released" : "Release hold"}
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}
        {!canRelease ? (
          <Callout icon={Lock}>
            <p>Only an approver can release a hold. Switch your role in the top bar to try it.</p>
          </Callout>
        ) : null}
      </Section>

      <Section title="All bank changes" note="40 changes from 3 Jun to 3 Sep, read from the vendor change log (E19).">
        <Tabs value={view} onValueChange={(v) => setView(String(v))}>
          <TabsList variant="line">
            <TabsTrigger value="held">Held {state.status === "ready" ? held.length : ""}</TabsTrigger>
            <TabsTrigger value="missing">No approval {state.status === "ready" ? changes.filter((c) => c.status === "missing").length : ""}</TabsTrigger>
            <TabsTrigger value="all">All {state.status === "ready" ? changes.length : ""}</TabsTrigger>
          </TabsList>
        </Tabs>
        {state.status === "loading" ? <TableSkeleton rows={6} /> : null}
        {state.status === "ready" ? (
          <div className="overflow-x-auto">
            <Db className="min-w-[54rem]">
              <DbHeader>
                <DbRow className="hover:bg-transparent">
                  <DbHead className={th}>Supplier</DbHead>
                  <DbHead className={th}>Account change</DbHead>
                  <DbHead className={th}>Channel</DbHead>
                  <DbHead className={th}>Approval</DbHead>
                  <DbHead className={th}>Changed by</DbHead>
                  <DbHead className={th}>When (UTC)</DbHead>
                  <DbHead className={th}>Check</DbHead>
                </DbRow>
              </DbHeader>
              <DbBody>
                {rows.map((c) => (
                  <DbRow key={c.id} className="hover:bg-paper-2">
                    <DbCell className={`${td} whitespace-normal`}>
                      <span className="font-medium">{c.vendor}</span>
                      <span className="block font-mono text-muted-foreground">{c.vendorId}</span>
                    </DbCell>
                    <DbCell className={`${td} font-mono whitespace-nowrap`}>
                      {c.oldValue} to {c.newValue}
                    </DbCell>
                    <DbCell className={td}>
                      <Tag color={c.channel === "API" ? "red" : "gray"}>{c.channel}</Tag>
                    </DbCell>
                    <DbCell className={`${td} font-mono`}>{c.approvalRef || <span className="font-sans text-muted-foreground">none</span>}</DbCell>
                    <DbCell className={`${td} font-mono`}>{c.changedBy}</DbCell>
                    <DbCell className={`${td} num whitespace-nowrap text-muted-foreground`}>{fmtTime(c.time)}</DbCell>
                    <DbCell className={td}>
                      <Tag color={statusColor[c.status]}>{statusLabel[c.status]}</Tag>
                    </DbCell>
                  </DbRow>
                ))}
              </DbBody>
            </Db>
          </div>
        ) : null}
      </Section>

      <Dialog open={Boolean(releasing)} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release the hold on {releasing?.vendor}?</DialogTitle>
            <DialogDescription>Release only after the supplier has confirmed the new account by phone. This lets the change into the next payment run.</DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="callback-confirmed" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 size-4 accent-primary" />
            <span>I phoned the supplier on a number we already trust, and they confirmed the account ending {releasing?.newValue.slice(-4)}.</span>
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Keep on hold
            </Button>
            <Button
              disabled={!confirmed}
              onClick={() => {
                if (releasing) release(releasing.id);
                close();
              }}
            >
              Release hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

export default function BankGatePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BankGateView />
    </Suspense>
  );
}
