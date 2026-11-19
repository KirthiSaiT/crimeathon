"use client";

import { Suspense, useState } from "react";
import { LifeBuoy, ShieldAlert } from "lucide-react";
import { Callout, PageShell, Section } from "@/components/page-shell";
import { Tag } from "@/components/tag";
import { EmptyState, ErrorState, PageSkeleton, TableSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/role-provider";
import { useTickets, type ScanResult, type Ticket } from "@/lib/supabase/tickets";
import { fmtTime } from "@/lib/format";

const textareaClass =
  "min-h-28 w-full border border-[var(--line-strong)] bg-[var(--bg-elevated)] px-2.5 py-2 text-sm outline-none focus-visible:outline-2 focus-visible:outline-[var(--signal)]";

// What the scanner found. It names the kind of secret and a short redacted preview, never the secret.
function Blocked({
  result,
  canOverride,
  reason,
  setReason,
  onOverride,
  busy,
}: {
  result: ScanResult;
  canOverride: boolean;
  reason: string;
  setReason: (v: string) => void;
  onOverride: () => void;
  busy: boolean;
}) {
  return (
    <div role="alert" className="flex max-w-2xl flex-col gap-3 border border-[var(--tp)] border-l-[var(--rule-bar)] bg-[var(--tp-subtle)] p-4 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <ShieldAlert className="size-4 text-[var(--tp)]" aria-hidden="true" />
        Nothing was saved. This looks like it contains a secret.
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {(result.patterns ?? []).map((p, i) => (
          <li key={`${p}-${i}`}>
            <Tag color="red">
              {p}: <span className="font-mono">{result.previews?.[i]}</span>
            </Tag>
          </li>
        ))}
      </ul>
      <p className="text-[var(--ink-secondary)]">Remove it and send again. To share a key with a customer or a colleague, use the Key vault, never a ticket. An administrator has been alerted.</p>
      {result.rotated && result.rotated.length > 0 ? (
        <p className="font-medium">The vault confirmed this was a live key, {result.rotated.join(", ")}, and replaced it at once. The pasted secret no longer works.</p>
      ) : null}
      {canOverride ? (
        <div className="flex flex-col gap-2 border-t border-[var(--line)] pt-3">
          <label className="flex flex-col gap-1.5">
            Reviewer override: why is this safe to raise? (at least 5 characters, logged)
            <Input name="override-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          </label>
          <div>
            <Button variant="outline" size="sm" disabled={busy || reason.trim().length < 5} onClick={onOverride}>
              Raise it with the secret masked
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CommentBox({ ticket, canOverride }: { ticket: Ticket; canOverride: boolean }) {
  const t = useTickets();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<ScanResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const send = async (override?: string) => {
    setBusy(true);
    setFailure(null);
    const { result, error } = await t.comment(ticket.id, text, override);
    setBusy(false);
    if (error || !result) return setFailure(error ?? "The comment could not be sent.");
    if (result.blocked) return setBlocked(result);
    setBlocked(null);
    setReason("");
    setText("");
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1.5 text-sm">
        Add a comment
        <textarea name={`comment-${ticket.id}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} className={textareaClass} />
      </label>
      <div>
        <Button size="sm" disabled={busy || !text.trim()} onClick={() => void send()}>
          {busy ? "Checking" : "Comment"}
        </Button>
      </div>
      {failure ? (
        <p role="alert" className="text-sm text-[var(--tp)]">
          {failure}
        </p>
      ) : null}
      {blocked ? <Blocked result={blocked} canOverride={canOverride} reason={reason} setReason={setReason} onOverride={() => void send(reason)} busy={busy} /> : null}
    </div>
  );
}

function TicketsView() {
  const { status, can, configured } = useAuth();
  const t = useTickets();
  const canRaise = can("raise_ticket");
  const canOverride = can("override_secret_block");

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<ScanResult | null>(null);
  const [reason, setReason] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const raise = async (override?: string) => {
    setBusy(true);
    setFailure(null);
    setNotice(null);
    const { result, error } = await t.raise(subject, body, override);
    setBusy(false);
    if (error || !result) return setFailure(error ?? "The ticket could not be raised.");
    if (result.blocked) return setBlocked(result);
    setBlocked(null);
    setReason("");
    setSubject("");
    setBody("");
    setNotice(result.masked ? `Ticket TKT-${result.id} raised with the secret masked.` : `Ticket TKT-${result.id} raised.`);
  };

  if (!configured || status !== "signed-in") {
    return (
      <PageShell icon={LifeBuoy} title="Support tickets" lead="A simulated help desk where every ticket and comment is checked for secrets before it is saved.">
        <EmptyState
          title={!configured ? "The database is not configured." : status === "loading" ? "Checking sign-in." : "Sign in to use the help desk."}
          body="Tickets are stored in the database, which only answers signed-in visitors."
        />
      </PageShell>
    );
  }

  return (
    <PageShell icon={LifeBuoy} title="Support tickets" lead="A simulated help desk where every ticket and comment is checked for secrets before it is saved. A ticket that contains one is not raised, and an administrator is alerted.">
      <Callout icon={ShieldAlert}>
        <p>
          <span className="font-medium">Why this exists.</span> In the case, a storage key was pasted into a ticket comment and stayed there for weeks. Here that comment would be refused, the person told why, and an administrator alerted. If the secret
          is a live key in the vault, the vault replaces it immediately. A simulation: made-up tickets only, and a pattern check can miss a secret that is split, encoded or in a screenshot.
        </p>
      </Callout>

      {canRaise ? (
        <Section title="Raise a ticket" note="Try pasting a made-up secret, for example password=hunter2hunter2 or bvk-7f3a, to see it refused.">
          <div className="flex max-w-2xl flex-col gap-3 border-t-2 border-[var(--ink)] pt-4">
            <label className="flex flex-col gap-1.5 text-sm">
              Subject
              <Input name="ticket-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} placeholder="Customer cannot pull delivery proofs" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              Details
              <textarea name="ticket-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} className={textareaClass} />
            </label>
            <div>
              <Button disabled={busy || !subject.trim()} onClick={() => void raise()}>
                {busy ? "Checking" : "Raise ticket"}
              </Button>
            </div>
            {failure ? (
              <p role="alert" className="text-sm text-[var(--tp)]">
                {failure}
              </p>
            ) : null}
            {notice ? (
              <p role="status" className="text-sm text-[var(--fp)]">
                {notice}
              </p>
            ) : null}
            {blocked ? <Blocked result={blocked} canOverride={canOverride} reason={reason} setReason={setReason} onOverride={() => void raise(reason)} busy={busy} /> : null}
          </div>
        </Section>
      ) : (
        <p className="text-sm text-[var(--ink-tertiary)]">Your role cannot raise tickets, but tickets can be read.</p>
      )}

      <Section title="Tickets" note="Newest first.">
        {t.error ? <ErrorState what="tickets" message={t.error} onRetry={t.reload} /> : null}
        {!t.error && t.tickets === null ? <TableSkeleton rows={3} /> : null}
        {t.tickets && t.tickets.length === 0 ? <EmptyState title="No tickets yet." body="Raise one above." /> : null}
        {t.tickets && t.tickets.length > 0 ? (
          <ul className="ledger">
            {t.tickets.map((k) => {
              const mine = t.comments.filter((c) => c.ticket_id === k.id);
              const open = openId === k.id;
              return (
                <li key={k.id} className="ledger-row px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="flex min-w-0 flex-wrap items-baseline gap-2">
                      <button type="button" className="text-left font-medium underline-offset-4 hover:underline" aria-expanded={open} onClick={() => setOpenId(open ? null : k.id)}>
                        {`TKT-${k.id}: ${k.subject}`}
                      </button>
                      {k.secret_masked ? <Tag color="yellow">Secret masked</Tag> : null}
                    </span>
                    <span className="text-[var(--ink-tertiary)]">
                      {k.created_by_email ?? "unknown"}, {fmtTime(k.created_at)} UTC, {mine.length} {mine.length === 1 ? "comment" : "comments"}
                    </span>
                  </div>
                  {open ? (
                    <div className="mt-3 flex max-w-2xl flex-col gap-3 border-t border-[var(--line)] pt-3">
                      {k.body ? <p className="whitespace-pre-wrap">{k.body}</p> : <p className="text-[var(--ink-tertiary)]">No details.</p>}
                      {mine.map((c) => (
                        <p key={c.id} className="border-l-2 border-[var(--line)] pl-3 whitespace-pre-wrap">
                          <span className="block text-[var(--ink-tertiary)]">
                            {c.created_by_email ?? "unknown"}, {fmtTime(c.created_at)} UTC {c.secret_masked ? <Tag color="yellow">Secret masked</Tag> : null}
                          </span>
                          {c.body}
                        </p>
                      ))}
                      {canRaise ? <CommentBox ticket={k} canOverride={canOverride} /> : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </Section>
    </PageShell>
  );
}

export default function TicketsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TicketsView />
    </Suspense>
  );
}
