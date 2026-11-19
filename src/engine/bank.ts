import type { Alert, BankChange, BankStatus } from "../lib/types";
import type { ChangeRow } from "./types";
import { refsOf } from "./groups";

const DAY = 86_400_000;
const iso = (ts: number) => new Date(ts).toISOString().replace(".000Z", "Z");

// The bank-change gate: every bank-account change must carry an approval reference that is present,
// unique and in sequence. A change that fails is held for a call-back before the next payment run.
export function checkBank(changes: ChangeRow[]): { bank: BankChange[]; alerts: Alert[] } {
  const bankRows = changes.filter((c) => c.field === "bank_account").sort((a, b) => a.ts - b.ts);
  if (bankRows.length === 0) return { bank: [], alerts: [] };
  const endTs = Math.max(...changes.map((c) => c.ts));

  let maxSeen = 0;
  const seen = new Map<string, number>();
  const outOfOrder = new Set<string>();
  for (const c of bankRows) {
    const m = /^APR-(\d+)$/.exec(c.approvalRef);
    if (!m) continue;
    seen.set(c.approvalRef, (seen.get(c.approvalRef) ?? 0) + 1);
    if (+m[1] < maxSeen) outOfOrder.add(c.id);
    maxSeen = Math.max(maxSeen, +m[1]);
  }

  const bank: BankChange[] = bankRows.map((c) => {
    let status: BankStatus = "approved";
    let why = "Approval reference present and in sequence.";
    if (!c.approvalRef) { status = "missing"; why = "No approval reference recorded."; }
    else if (/^BULK-/.test(c.approvalRef)) { status = "bulk"; why = "Bulk import with a BULK reference."; }
    else if (outOfOrder.has(c.id)) { status = "out-of-sequence"; why = "Reference number is out of sequence with its date."; }
    else if ((seen.get(c.approvalRef) ?? 0) > 1) { status = "out-of-sequence"; why = "Reference was already used for another change."; }
    const recent = c.ts >= endTs - 14 * DAY;
    const hold = (status === "missing" && (c.channel === "API" || recent)) || status === "out-of-sequence";
    return {
      id: c.id, vendorId: c.vendorId, vendor: c.vendor, oldValue: c.oldValue, newValue: c.newValue, changedBy: c.changedBy,
      channel: c.channel, approvalRef: c.approvalRef, time: iso(c.ts), sourceIp: c.sourceIp, requestId: c.requestId,
      evidence: `${c.file} line ${c.line}`, status, why, hold,
    };
  }).reverse();

  const rowsOf = (pred: (c: ChangeRow) => boolean) => bankRows.filter(pred);
  const total = bankRows.length;
  const apiAll = bankRows.filter((c) => c.channel === "API").length;
  const uiAll = bankRows.filter((c) => c.channel === "UI").length;
  const impAll = bankRows.filter((c) => c.channel === "IMPORT").length;

  const mk = (rows: ChangeRow[], a: Omit<Alert, "start" | "end" | "count" | "evidence" | "source" | "key" | "system">): Alert | null =>
    rows.length === 0 ? null : {
      ...a,
      system: "LedgerOne",
      key: [...new Set(rows.map((r) => r.changedBy))].join(", "),
      source: [...new Set(rows.map((r) => r.sourceIp))].join(", "),
      start: iso(rows[0].ts),
      end: iso(rows[rows.length - 1].ts),
      count: rows.length,
      evidence: refsOf(rows),
    };

  const apiMissing = rowsOf((c) => c.channel === "API" && !c.approvalRef);
  const uiMissing = rowsOf((c) => c.channel !== "API" && !c.approvalRef);
  const oos = rowsOf((c) => outOfOrder.has(c.id));
  const bulk = rowsOf((c) => c.channel === "IMPORT" && /^BULK-/.test(c.approvalRef));

  const alerts = [
    mk(apiMissing, { id: "", title: "Supplier bank account changed through the API with no approval", severity: "critical", status: "open",
      rule: `The change log shows a blank approval reference on a change made by a software key. ${apiAll} of ${total} bank changes came through the API, and this is the only one without approval.`,
      normal: `The other bank changes were made on screen (${uiAll}) or by bulk import (${impAll}), from office addresses.` }),
    mk(oos, { id: "", title: "Approval reference out of sequence", severity: "high", status: "review",
      rule: "The reference number does not fit the date it was used. Every other reference rises with time. It could be a mistake, a reused approval or a back-dated one, and only a call-back will tell.",
      normal: "References rise with time, one per change." }),
    mk(uiMissing, { id: "", title: "Bank changes on screen with no approval reference", severity: "medium", status: "review",
      rule: "Finance staff changed bank details without recording an approval reference. A control gap, on the office network, not part of the key abuse.",
      normal: "Most screen changes carry an APR reference." }),
    mk(bulk, { id: "", title: "Finance bulk import with a BULK reference", severity: "low", status: "ordinary",
      rule: "Not flagged. Month-end clean-up by import with a BULK reference, as the case file describes.",
      normal: "Bulk changes carry a reference and come from the office." }),
  ].filter((a): a is Alert => a !== null);

  return { bank, alerts };
}
