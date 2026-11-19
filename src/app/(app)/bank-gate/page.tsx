"use client";

import { Suspense, useMemo, useState } from "react";
import { Landmark, Lock } from "lucide-react";
import { Callout, PageShell, Section } from "@/components/page-shell";
import { Tag, type TagColor } from "@/components/tag";
import { Db, DbBody, DbCell, DbHead, DbHeader, DbRow, td, th } from "@/components/db";
import { EmptyState, ErrorState, PageSkeleton, TableSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/components/role-provider";
import { useHoldReleases, useHoldRequests, useSettings } from "@/lib/supabase/data";
import { useSlice } from "@/components/analysis-provider";
import { fmtDate, fmtTime } from "@/lib/format";
import { useQueryState } from "@/lib/use-query-state";
import type { BankChange, BankStatus } from "@/lib/types";

const statusLabel: Record<BankStatus, string> = { approved: "Approved", missing: "No approval", bulk: "Bulk import", "out-of-sequence": "Out of sequence", "api-channel": "Made by a key" };
const statusColor: Record<BankStatus, TagColor> = { approved: "green", missing: "red", bulk: "blue", "out-of-sequence": "orange", "api-channel": "red" };

function BankGateView() {
  const { state, retry } = useSlice((a) => a.bank);
  const { role, can, status: authStatus, configured, user } = useAuth();
  const { requests, request: requestRelease } = useHoldRequests();
  const { twoPersonRule } = useSettings();
  const [mode, setMode] = useState<"release" | "request">("release");
  const { released, error: releaseError, release } = useHoldReleases();
  const [view, setView] = useQueryState("view", "held");
  const [releasing, setReleasing] = useState<BankChange | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [releaseFailure, setReleaseFailure] = useState<string | null>(null);

  const changes = useMemo(() => (state.status === "ready" ? state.data : []), [state]);
  const held = changes.filter((c) => c.hold);
  const rows = changes.filter((c) => (view === "held" ? c.hold : view === "missing" ? c.status === "missing" : true));
  const canRelease = can("release_hold");
  const canRequest = can("request_release");
  const requestFor = (id: string) => requests.find((r) => r.change_id === id);
  const requestedByOther = (id: string) => {
    const r = requestFor(id);
    return Boolean(r && r.requested_by !== user?.id);
  };

  const close = () => {
    setReleasing(null);
    setConfirmed(false);
    setNote("");
    setReleaseFailure(null);
  };

  const confirmRelease = async () => {
    if (!releasing) return;
    setSaving(true);
    const failure = mode === "request" ? await requestRelease(releasing.id, note.trim()) : await release(releasing.id, note.trim());
    setSaving(false);
    if (failure) setReleaseFailure(failure);
    else close();
  };

  return (
    <PageShell
      icon={Landmark}
      title="Bank gate"
      lead="Every supplier bank change, checked for an approval reference. Changes that fail are held for a call-back before the next payment run."
    >
      <Section title="Held for call-back" note="Phone the supplier on a number you already trust, from the contract and not from the change request.">
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
                      {c.contactChangedDays !== undefined ? <Tag color="yellow">Call-back contact changed {c.contactChangedDays} days earlier</Tag> : null}
                      {isReleased ? <Tag color="green">Released</Tag> : <Tag color="red">On hold</Tag>}
                      {!isReleased && requestFor(c.id) ? <Tag color="yellow">Release requested</Tag> : null}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      <span className="font-mono">{c.oldValue}</span> to <span className="font-mono">{c.newValue}</span>
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {c.why} Changed by {c.changedBy} through {c.channel === "API" ? "the API" : c.channel === "UI" ? "the screen" : "a bulk import"} from {c.sourceIp} at {fmtTime(c.time)} UTC.
                    </p>
                    <p className="mt-2">
                      <Tag mono>{c.evidence}</Tag>
                    </p>
                  </div>
                  {canRequest && !canRelease ? (
                    <Button
                      variant="outline"
                      disabled={isReleased || Boolean(requestFor(c.id))}
                      onClick={() => {
                        setMode("request");
                        setReleasing(c);
                      }}
                    >
                      {isReleased ? "Hold released" : requestFor(c.id) ? "Release requested" : "Request release"}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      disabled={!canRelease || isReleased || (twoPersonRule && !requestedByOther(c.id))}
                      title={canRelease && twoPersonRule && !requestedByOther(c.id) && !isReleased ? "An analyst has to request this release first." : undefined}
                      onClick={() => {
                        setMode("release");
                        setReleasing(c);
                      }}
                    >
                      {isReleased ? "Hold released" : "Release hold"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
        {!canRelease && !canRequest ? (
          <Callout icon={Lock}>
            <p>
              {!configured
                ? "The database is not configured, so holds cannot be released."
                : authStatus !== "signed-in"
                  ? "Sign in as an approver to release a hold. Signed-out visitors can read the queue but cannot see which holds were released."
                  : `Your role (${role}) cannot release or request release of a hold.`}
            </p>
          </Callout>
        ) : null}
        {releaseError ? (
          <p role="alert" className="text-sm text-[var(--tp)]">
            Releases could not be loaded: {releaseError}
          </p>
        ) : null}
      </Section>

      <Section title="All bank changes" note={changes.length ? `${changes.length} bank ${changes.length === 1 ? "change" : "changes"} from ${fmtDate(changes[changes.length - 1].time)} to ${fmtDate(changes[0].time)}, read from the vendor change log.` : "No vendor change log loaded."}>
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
                      {c.contactChangedDays !== undefined ? <Tag color="yellow">Call-back contact changed {c.contactChangedDays} days earlier</Tag> : null}
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
            <DialogTitle>{mode === "request" ? "Request release of" : "Release the hold on"} {releasing?.vendor}?</DialogTitle>
            <DialogDescription>Release only after the supplier has confirmed the new account by phone. This lets the change into the next payment run.</DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="callback-confirmed" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 size-4 accent-primary" />
            <span>I phoned the supplier on a number we already trust, and they confirmed the account ending {releasing?.newValue.slice(-4)}.</span>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Call-back note (who you spoke to, optional)
            <Input name="callback-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </label>
          {releaseFailure ? (
            <p role="alert" className="text-sm text-[var(--tp)]">
              {releaseFailure}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Keep on hold
            </Button>
            <Button disabled={!confirmed || saving} onClick={() => void confirmRelease()}>
              {saving ? "Saving" : mode === "request" ? "Send request" : "Release hold"}
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
