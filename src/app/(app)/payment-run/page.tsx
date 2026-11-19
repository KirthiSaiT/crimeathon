"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { Landmark } from "lucide-react";
import { PageShell, Section } from "@/components/page-shell";
import { Tag, type TagColor } from "@/components/tag";
import { Db, DbBody, DbCell, DbHead, DbHeader, DbRow, td, th } from "@/components/db";
import { EmptyState, ErrorState, PageSkeleton, TableSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSlice } from "@/components/analysis-provider";
import { useAuth } from "@/components/role-provider";
import { useHoldReleases, useSettings } from "@/lib/supabase/data";
import { usePendingChanges, type PendingChange } from "@/lib/supabase/vault";
import { fmtDate, fmtTime } from "@/lib/format";
import type { BankChange } from "@/lib/types";

const DAY = 86_400_000;

// Payments run on the 8th and the 23rd. Given a moment, the run before it and the run after it.
function runsAround(ts: number) {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const at = (yy: number, mm: number, dd: number) => Date.UTC(yy, mm, dd);
  if (day < 8) return { last: at(y, m - 1, 23), next: at(y, m, 8) };
  if (day < 23) return { last: at(y, m, 8), next: at(y, m, 23) };
  return { last: at(y, m, 23), next: at(y, m + 1, 8) };
}

const pendingColor: Record<PendingChange["status"], TagColor> = { held: "red", released: "green", rejected: "gray" };

function PaymentRunView() {
  const { state, retry } = useSlice((a) => a.bank);
  const { status: authStatus, can, user, configured } = useAuth();
  const { released } = useHoldReleases();
  const { twoPersonRule } = useSettings();
  const pending = usePendingChanges();
  const [dialog, setDialog] = useState<{ change: PendingChange; mode: "request" | "release" | "reject" } | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const changes: BankChange[] = useMemo(() => (state.status === "ready" ? state.data : []), [state]);
  const end = useMemo(() => (changes.length ? Math.max(...changes.map((c) => Date.parse(c.time))) : 0), [changes]);
  const { last, next } = runsAround(end);
  const blocked = changes.filter((c) => c.hold && !released.includes(c.id));
  const payable = changes.filter((c) => Date.parse(c.time) > last && (!c.hold || released.includes(c.id)));
  const daysToRun = Math.round(((next - end) / DAY) * 10) / 10;

  const close = () => {
    setDialog(null);
    setNote("");
    setFailure(null);
  };
  const confirm = async () => {
    if (!dialog) return;
    setSaving(true);
    const result =
      dialog.mode === "request"
        ? await pending.requestRelease(dialog.change.id, note.trim())
        : await pending.decide(dialog.change.id, dialog.mode === "release", note.trim());
    setSaving(false);
    if (result) setFailure(result);
    else close();
  };

  return (
    <PageShell
      icon={Landmark}
      title="Payment run"
      lead="What the next run will pay and what it will not. A bank change that fails a check is blocked until two different people have released it."
    >
      {state.status === "ready" && changes.length > 0 ? (
        <dl className="ledger">
          <div className="grid grid-cols-2 gap-px bg-[var(--line)] min-[60rem]:grid-cols-4">
            {[
              { label: "Next payment run", value: fmtDate(new Date(next).toISOString()), note: `${daysToRun} days after the records end` },
              { label: "Blocked until released", value: String(blocked.length), note: "held bank changes" },
              { label: "Payable this run", value: String(payable.length), note: "changed since the last run, and sound" },
              { label: "Held by the vault", value: String((pending.rows ?? []).filter((r) => r.status === "held").length), note: "asked for by a key" },
            ].map((k) => (
              <div key={k.label} className="flex flex-col-reverse justify-end gap-1 bg-[var(--bg-elevated)] px-4 py-4">
                <dt className="text-sm text-[var(--ink-tertiary)]">
                  {k.label}
                  <span className="block">{k.note}</span>
                </dt>
                <dd className="num text-3xl leading-none font-bold tracking-[var(--track-display)]">{k.value}</dd>
              </div>
            ))}
          </div>
        </dl>
      ) : null}

      <Section title="Blocked until released" note={`${end ? `As at ${fmtDate(new Date(end).toISOString())}, the end of the supplied records.` : "No bank changes in these logs."} These do not go into a run until released on the bank gate.`}>
        {state.status === "loading" ? <TableSkeleton rows={2} /> : null}
        {state.status === "error" ? <ErrorState what="bank changes" message={state.message} onRetry={retry} /> : null}
        {state.status === "ready" && blocked.length === 0 ? <EmptyState title="Nothing is blocked." body="Every bank change either passed its checks or has been released." /> : null}
        {blocked.length > 0 ? (
          <ul className="ledger">
            {blocked.map((c) => (
              <li key={c.id} className="ledger-row flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{c.vendor}</span>
                  <span className="ml-2 font-mono text-[var(--signal)]">{c.vendorId}</span>
                  <span className="mt-0.5 block text-[var(--ink-secondary)]">
                    <span className="font-mono">{c.oldValue}</span> to <span className="font-mono">{c.newValue}</span>
                  </span>
                  <span className="mt-0.5 block text-[var(--ink-tertiary)]">{c.why}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {c.contactChangedDays !== undefined ? <Tag color="yellow">Call-back contact changed {c.contactChangedDays} days earlier</Tag> : null}
                  <Tag mono>{c.evidence}</Tag>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <Link href="/bank-gate" className="w-fit text-sm underline decoration-[var(--line-strong)] underline-offset-4 hover:decoration-[var(--signal)]">
          Open the bank gate to request or release a hold
        </Link>
      </Section>

      <Section title="Payable this run" note="Bank changes since the last run that passed every check, plus holds that have been released.">
        {state.status === "loading" ? <TableSkeleton rows={3} /> : null}
        {state.status === "ready" && payable.length === 0 ? <EmptyState title="No bank changes since the last run." body="Nothing new needs to be checked before the next run." /> : null}
        {payable.length > 0 ? (
          <div className="overflow-x-auto">
            <Db className="min-w-[44rem]">
              <DbHeader>
                <DbRow className="hover:bg-transparent">
                  <DbHead className={th}>Supplier</DbHead>
                  <DbHead className={th}>Account change</DbHead>
                  <DbHead className={th}>Changed by</DbHead>
                  <DbHead className={th}>When (UTC)</DbHead>
                  <DbHead className={th}>Why it is payable</DbHead>
                </DbRow>
              </DbHeader>
              <DbBody>
                {payable.map((c) => (
                  <DbRow key={c.id} className="hover:bg-[var(--bg-subtle)]">
                    <DbCell className={`${td} whitespace-normal`}>
                      <span className="font-medium">{c.vendor}</span>
                      <span className="block font-mono text-[var(--ink-tertiary)]">{c.vendorId}</span>
                    </DbCell>
                    <DbCell className={`${td} font-mono whitespace-nowrap`}>
                      {c.oldValue} to {c.newValue}
                    </DbCell>
                    <DbCell className={`${td} font-mono`}>{c.changedBy}</DbCell>
                    <DbCell className={`${td} num whitespace-nowrap text-[var(--ink-tertiary)]`}>{fmtTime(c.time)}</DbCell>
                    <DbCell className={`${td} whitespace-normal`}>
                      {released.includes(c.id) ? <Tag color="green">Released after a call-back</Tag> : c.status === "bulk" ? <Tag color="blue">Bulk import with a reference</Tag> : <Tag color="green">Approved</Tag>}
                      {c.contactChangedDays !== undefined ? <Tag color="yellow">Contact changed {c.contactChangedDays} days earlier</Tag> : null}
                    </DbCell>
                  </DbRow>
                ))}
              </DbBody>
            </Db>
          </div>
        ) : null}
      </Section>

      <Section title="Held by the vault" note="In the simulated LedgerOne a key can ask for a bank change but never makes one. The change waits here until one person asks for its release and a different person approves it.">
        {authStatus !== "signed-in" ? (
          <EmptyState title={configured ? "Sign in to see the vault's held changes." : "The database is not configured."} body="Held changes are stored in the database, which only answers signed-in visitors." />
        ) : null}
        {authStatus === "signed-in" && pending.error ? <ErrorState what="held changes" message={pending.error} onRetry={() => window.location.reload()} /> : null}
        {authStatus === "signed-in" && !pending.error && pending.rows === null ? <TableSkeleton rows={2} /> : null}
        {pending.rows && pending.rows.length === 0 ? <EmptyState title="Nothing held by the vault." body="Run the attack replay on the Key vault page, or call the bank-change action with a key, and the change lands here." /> : null}
        {pending.rows && pending.rows.length > 0 ? (
          <div className="overflow-x-auto">
            <Db className="min-w-[60rem]">
              <DbHeader>
                <DbRow className="hover:bg-transparent">
                  <DbHead className={th}>Supplier</DbHead>
                  <DbHead className={th}>Account change</DbHead>
                  <DbHead className={th}>Asked by</DbHead>
                  <DbHead className={th}>From</DbHead>
                  <DbHead className={th}>Status</DbHead>
                  <DbHead className={th}>Actions</DbHead>
                </DbRow>
              </DbHeader>
              <DbBody>
                {pending.rows.map((r) => {
                  const requestedByOther = Boolean(r.release_requested_by && r.release_requested_by !== user?.id);
                  return (
                    <DbRow key={r.id} className="hover:bg-[var(--bg-subtle)]">
                      <DbCell className={`${td} whitespace-normal`}>
                        <span className="font-mono">{r.vendor_id}</span>
                        <span className="block text-[var(--ink-tertiary)]">{fmtTime(r.created_at)}</span>
                      </DbCell>
                      <DbCell className={`${td} font-mono whitespace-nowrap`}>
                        ****{r.old_last4} to ****{r.new_last4}
                      </DbCell>
                      <DbCell className={`${td} whitespace-normal`}>
                        <span className="font-mono">{r.key_name ?? "a deleted key"}</span>
                        {r.contact_recent ? <Tag color="yellow">Call-back contact changed in the last 14 days</Tag> : null}
                      </DbCell>
                      <DbCell className={`${td} font-mono`}>{r.source_ip ?? ""}</DbCell>
                      <DbCell className={`${td} whitespace-normal`}>
                        <Tag color={pendingColor[r.status]}>{r.status === "held" ? "Held" : r.status === "released" ? "Released" : "Rejected"}</Tag>
                        {r.status === "held" && r.release_requested_by ? <Tag color="yellow">Release requested</Tag> : null}
                        {r.release_note ? <span className="mt-1 block text-[var(--ink-tertiary)]">{r.release_note}</span> : null}
                      </DbCell>
                      <DbCell className={td}>
                        {r.status === "held" ? (
                          <span className="flex flex-wrap gap-1.5">
                            {can("request_release") && !r.release_requested_by ? (
                              <Button size="xs" variant="outline" onClick={() => setDialog({ change: r, mode: "request" })}>
                                Request release
                              </Button>
                            ) : null}
                            {can("release_hold") ? (
                              <>
                                <Button
                                  size="xs"
                                  variant="outline"
                                  disabled={twoPersonRule && !requestedByOther}
                                  title={twoPersonRule && !requestedByOther ? "A different person has to request this release first." : undefined}
                                  onClick={() => setDialog({ change: r, mode: "release" })}
                                >
                                  Release
                                </Button>
                                <Button size="xs" variant="destructive" onClick={() => setDialog({ change: r, mode: "reject" })}>
                                  Reject
                                </Button>
                              </>
                            ) : null}
                          </span>
                        ) : null}
                      </DbCell>
                    </DbRow>
                  );
                })}
              </DbBody>
            </Db>
          </div>
        ) : null}
      </Section>

      <Section title="The rules that guard the money" note="Each one stands on its own. None of them depends on spotting the attacker.">
        <ol className="ledger">
          {[
            ["A key never changes a bank account.", "In the vault a bank change by a key is stored as a held request. It is applied only when people release it."],
            ["A change made through the API is always held.", "Even with an approval reference, because references can be guessed or forged."],
            ["A weak approval plus a recently changed contact is held.", "If the supplier's phone or email changed in the 14 days before the bank account and the change has no sound reference, a call to that number proves nothing."],
            ["Releasing needs a second person.", "One person asks, a different one approves. An administrator can switch this off, and doing so is logged."],
            ["Every step is recorded.", "Requests, releases, rejections and rule changes are written to the audit log by the database itself."],
          ].map(([rule, why], i) => (
            <li key={rule} className="ledger-row grid gap-x-4 gap-y-1 px-4 py-3 text-sm sm:grid-cols-[2rem_20rem_1fr]">
              <span className="num font-bold">{i + 1}</span>
              <span className="font-medium">{rule}</span>
              <span className="text-[var(--ink-secondary)]">{why}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Dialog open={Boolean(dialog)} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "request" ? "Request release of" : dialog?.mode === "release" ? "Release" : "Reject"} the change to {dialog?.change.vendor_id}?
            </DialogTitle>
            <DialogDescription>
              {dialog?.mode === "request"
                ? "Ask an approver to release this change, after the supplier has confirmed the new account by phone on a number from the contract. A different person approves it."
                : dialog?.mode === "release"
                  ? "This applies the new account number. Release only after a call-back to a number you already trust."
                  : "The change is dropped and the supplier keeps its current account."}
            </DialogDescription>
          </DialogHeader>
          <label className="flex flex-col gap-1.5 text-sm">
            Note (who you spoke to, optional)
            <Input name="decision-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </label>
          {failure ? (
            <p role="alert" className="text-sm text-[var(--tp)]">
              {failure}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button variant={dialog?.mode === "reject" ? "destructive" : "default"} disabled={saving} onClick={() => void confirm()}>
              {saving ? "Saving" : dialog?.mode === "request" ? "Send request" : dialog?.mode === "release" ? "Release" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

export default function PaymentRunPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PaymentRunView />
    </Suspense>
  );
}
