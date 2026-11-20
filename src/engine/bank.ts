import type { Alert, BankChange, BankStatus } from "../lib/types";
import type { ChangeRow } from "./types";
import { refsOf } from "./groups";
import { maxOf } from "./num";

const DAY = 86_400_000;
const iso = (ts: number) => new Date(ts).toISOString().replace(".000Z", "Z");
const CONTACT_FIELDS = new Set(["contact_phone", "contact_email"]);

// The bank-change gate: every bank-account change must carry an approval reference that is present,
// unique and in sequence. A change that fails is held for a call-back before the next payment run.
export function checkBank(changes: ChangeRow[]): { bank: BankChange[]; alerts: Alert[] } {
  const bankRows = changes.filter((c) => c.field === "bank_account").sort((a, b) => a.ts - b.ts);
  if (bankRows.length === 0) return { bank: [], alerts: [] };
  const endTs = maxOf(changes.map((c) => c.ts));

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

  const contactRows = changes.filter((c) => CONTACT_FIELDS.has(c.field));
  const escalated = new Set<string>();
  // A reference that is not a real kind of reference at all (made-up text, or a BULK reference on a change that was not a bulk import).
  const invalid = new Set<string>();
  const bank: BankChange[] = bankRows.map((c) => {
    let status: BankStatus = "approved";
    let why = "Approval reference present and in sequence.";
    if (!c.approvalRef) { status = "missing"; why = "No approval reference recorded."; }
    else if (/^BULK-[A-Za-z0-9-]+$/.test(c.approvalRef) && c.channel === "IMPORT") { status = "bulk"; why = "Bulk import with a BULK reference."; }
    else if (!/^APR-\d+$/.test(c.approvalRef)) {
      status = "missing";
      invalid.add(c.id);
      why = /^BULK-/.test(c.approvalRef) ? `A BULK reference (${c.approvalRef}) is only valid on a bulk import, not on a change made ${c.channel === "API" ? "through the API" : "on screen"}.` : `"${c.approvalRef}" is not a valid approval reference. A real one looks like APR-1234.`;
    }
    else if (outOfOrder.has(c.id)) { status = "out-of-sequence"; why = "Reference number is out of sequence with its date."; }
    else if ((seen.get(c.approvalRef) ?? 0) > 1) { status = "out-of-sequence"; why = "Reference was already used for another change."; }
    // A change made through a software key is never waved through on a reference alone: references can be guessed or forged.
    if (c.channel === "API" && status === "approved") { status = "api-channel"; why = "Made through the API by a software key. Held for a call-back even though it carries a reference."; }
    // The call-back number is the weak spot: if the supplier's contact changed shortly before the bank account, a call to it proves nothing.
    const earlier = contactRows.filter((r) => r.vendorId === c.vendorId && r.ts < c.ts && c.ts - r.ts <= 14 * DAY).sort((a, b) => b.ts - a.ts)[0];
    const contactChangedDays = earlier ? Math.round(((c.ts - earlier.ts) / DAY) * 10) / 10 : undefined;
    const weak = status === "missing" || status === "out-of-sequence";
    const recent = c.ts >= endTs - 14 * DAY;
    const hold = (status === "missing" && (c.channel === "API" || recent)) || status === "out-of-sequence" || c.channel === "API" || invalid.has(c.id) || (contactChangedDays !== undefined && weak);
    if (contactChangedDays !== undefined && weak) escalated.add(c.id);
    if (contactChangedDays !== undefined && weak) why += ` The supplier's call-back contact changed ${contactChangedDays} days earlier: phone a number from the contract, not one from the request.`;
    return {
      id: c.id, vendorId: c.vendorId, vendor: c.vendor, oldValue: c.oldValue, newValue: c.newValue, changedBy: c.changedBy,
      channel: c.channel, approvalRef: c.approvalRef, time: iso(c.ts), sourceIp: c.sourceIp, requestId: c.requestId,
      evidence: `${c.file} line ${c.line}`, status, why, hold, ...(contactChangedDays !== undefined ? { contactChangedDays } : {}),
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
  const apiWithRef = rowsOf((c) => c.channel === "API" && !!c.approvalRef);
  const invalidRows = rowsOf((c) => invalid.has(c.id));
  const contactFirst = rowsOf((c) => escalated.has(c.id));
  const uiMissing = rowsOf((c) => c.channel !== "API" && !c.approvalRef);
  const oos = rowsOf((c) => outOfOrder.has(c.id));
  const bulk = rowsOf((c) => c.channel === "IMPORT" && /^BULK-/.test(c.approvalRef));

  const alerts = [
    mk(apiMissing, { id: "", title: "Supplier bank account changed through the API with no approval", severity: "critical", status: "open",
      rule: `The change log shows a blank approval reference on a change made by a software key. ${apiAll} of ${total} bank changes came through the API, and this is the only one without approval.`,
      normal: `The other bank changes were made on screen (${uiAll}) or by bulk import (${impAll}), from office addresses.` }),
    mk(apiWithRef, { id: "", title: "Bank account changed through the API", severity: "high", status: "open",
      rule: "A software key changed a supplier's bank account. A reference is present, but references can be guessed or forged, so the change is held for a call-back anyway.",
      normal: "Bank changes are made on screen by finance staff or by a reviewed bulk import." }),
    mk(invalidRows, { id: "", title: "Bank change with an invalid approval reference", severity: "high", status: "open",
      rule: "The approval reference is not one the approval system issues: it is made-up text, or a BULK reference on a change that was not a bulk import. The change is held for a call-back.",
      normal: "Approval references look like APR-1234, and BULK references appear only on bulk imports." }),
    mk(contactFirst, { id: "", title: "Call-back contact changed shortly before a weakly approved bank change", severity: "high", status: "review",
      rule: "The supplier's phone or email was changed in the 14 days before its bank account, and the bank change has no sound approval. A call to the new number proves nothing, so the change is held.",
      normal: "Contact details and bank details are not usually changed together without a reference." }),
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
