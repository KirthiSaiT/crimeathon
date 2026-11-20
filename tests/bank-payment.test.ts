import path from "node:path";
import { describe, expect, it } from "vitest";
import { addFile, analyze, emptyParsed, type Context, type Parsed } from "../src/engine";
import pack from "../case-pack/CR-26-047.json";
import { checkBank } from "../src/engine/bank";
import { loadEvidenceDir } from "../src/engine/node";
import { runsAround, splitPaymentRun } from "../src/engine/payment";
import type { ChangeRow } from "../src/engine/types";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 7, 1, 9, 0, 0); // 1 Aug 2026
let n = 0;
// One bank change, with only what a test cares about spelled out.
const bank = (o: Partial<ChangeRow> = {}): ChangeRow => ({
  file: "E19.csv", line: ++n + 1, id: `chg-${n}`, ts: T0 + n * DAY, vendorId: `V-${1000 + n}`, vendor: "Test Supplier", field: "bank_account",
  oldValue: "1111", newValue: "2222", changedBy: "h.krishnan", channel: "UI", approvalRef: "", sourceIp: "172.16.8.35", requestId: "", ...o,
});
const held = (rows: ChangeRow[], id: string) => checkBank(rows).bank.find((b) => b.id === id)!;

describe("bank gate: the approval reference", () => {
  it("holds a change with no reference when it is recent", () => {
    const c = bank({ ts: T0 });
    expect(held([c], c.id)).toMatchObject({ status: "missing", hold: true });
  });
  it("holds a change with no reference made through the API, whenever it was", () => {
    const old = bank({ channel: "API", ts: T0 - 60 * DAY });
    const filler = bank({ ts: T0 + 60 * DAY, approvalRef: "APR-1" });
    expect(held([old, filler], old.id).hold).toBe(true);
  });
  it("only flags, and does not hold, an old on-screen change with no reference", () => {
    const old = bank({ ts: T0 - 60 * DAY });
    const later = bank({ ts: T0 + 60 * DAY, approvalRef: "APR-1" });
    expect(held([old, later], old.id)).toMatchObject({ status: "missing", hold: false });
  });
  it("passes a sound reference in sequence", () => {
    const a = bank({ approvalRef: "APR-1" });
    const b = bank({ approvalRef: "APR-2" });
    expect(held([a, b], a.id)).toMatchObject({ status: "approved", hold: false });
    expect(held([a, b], b.id)).toMatchObject({ status: "approved", hold: false });
  });
  it("holds a reference used twice, and says why", () => {
    const a = bank({ approvalRef: "APR-5" });
    const b = bank({ approvalRef: "APR-5" });
    const out = checkBank([a, b]).bank;
    expect(out.every((x) => x.hold && x.status === "out-of-sequence")).toBe(true);
    expect(out[0].why).toMatch(/already used/);
  });
  it("holds a reference that is out of sequence with its date", () => {
    const rows = [bank({ approvalRef: "APR-10" }), bank({ approvalRef: "APR-11" }), bank({ approvalRef: "APR-3" })];
    expect(held(rows, rows[2].id)).toMatchObject({ status: "out-of-sequence", hold: true });
    expect(held(rows, rows[1].id).hold).toBe(false);
  });
  it("holds a change made through the API even with a perfect reference", () => {
    const c = bank({ channel: "API", approvalRef: "APR-1" });
    expect(held([c], c.id)).toMatchObject({ status: "api-channel", hold: true });
  });
  it("holds a bank change whose reference is not in the APR-number form", () => {
    for (const ref of ["TEST", "apr-0001", "APR-", "FORGED-77", "APR 12", "x"]) {
      const c = bank({ ts: T0 - 90 * DAY, approvalRef: ref });
      const later = bank({ ts: T0 + 90 * DAY, approvalRef: "APR-1" });
      expect(held([c, later], c.id).hold, `reference "${ref}"`).toBe(true);
    }
  });
  it("accepts a BULK reference only from a bulk import, never from a person on screen or a key", () => {
    const imp = bank({ channel: "IMPORT", approvalRef: "BULK-7" });
    expect(held([imp], imp.id)).toMatchObject({ status: "bulk", hold: false });
    for (const channel of ["UI", "API"]) {
      const c = bank({ channel, approvalRef: "BULK-7" });
      expect(held([c], c.id).hold, `BULK reference from ${channel}`).toBe(true);
    }
  });
  it("holds a weak change when the call-back contact changed in the last 14 days, even if it is old", () => {
    const b = bank({ ts: T0 - 90 * DAY });
    const contact = bank({ field: "contact_phone", vendorId: b.vendorId, ts: b.ts - 3 * DAY });
    const later = bank({ ts: T0 + 90 * DAY, approvalRef: "APR-1" });
    expect(held([b, contact, later], b.id)).toMatchObject({ hold: true, contactChangedDays: 3 });
  });
  it("does not count a contact change from another supplier, or from more than 14 days before", () => {
    const b = bank({ ts: T0 - 90 * DAY });
    const other = bank({ field: "contact_email", vendorId: "V-OTHER", ts: b.ts - 1 * DAY });
    const tooOld = bank({ field: "contact_phone", vendorId: b.vendorId, ts: b.ts - 20 * DAY });
    const later = bank({ ts: T0 + 90 * DAY, approvalRef: "APR-1" });
    expect(held([b, other, tooOld, later], b.id)).toMatchObject({ hold: false });
  });
  it("ignores fields that are not the bank account, and an empty log", () => {
    expect(checkBank([]).bank).toEqual([]);
    expect(checkBank([bank({ field: "address" }), bank({ field: "contact_email" })]).bank).toEqual([]);
  });
  it("gives the same answer whatever order the rows arrive in", () => {
    const rows = [bank({ approvalRef: "APR-1" }), bank({ approvalRef: "APR-2" }), bank({ approvalRef: "APR-1", ts: T0 + 50 * DAY }), bank({ channel: "API", approvalRef: "APR-9" })];
    const a = checkBank(rows).bank.map((b) => `${b.id}:${b.hold}`).sort();
    const b = checkBank([...rows].reverse()).bank.map((x) => `${x.id}:${x.hold}`).sort();
    expect(b).toEqual(a);
  });
  it("reads a change log through the real loader, trimming spaces and recognising it by its columns", () => {
    const p: Parsed = emptyParsed();
    const csv = [
      "ts_utc,change_id,vendor_id,vendor_name,field,old_value,new_value,changed_by,channel,approval_ref,source_ip,request_id",
      "2026-08-30T09:00:00Z,chg-a1,V-0900,Test Supplier,bank_account,1111,2222,x.user,UI, APR-7 ,172.16.8.1,",
      "2026-08-31T09:00:00Z,chg-a2,V-0901,Test Supplier,bank_account,1111,2222,svc-key,API,,10.0.0.9,req-1",
    ].join("\n");
    addFile(p, "renamed-changes.csv", csv);
    expect(p.changes.map((c) => c.approvalRef)).toEqual(["APR-7", ""]);
    const out = checkBank(p.changes).bank;
    expect(out.find((b) => b.id === "chg-a2")?.hold).toBe(true);
    expect(out.find((b) => b.id === "chg-a1")?.hold).toBe(false);
  });
});

// ---- The payment run, on the supplied evidence
const parsed: Parsed = loadEvidenceDir(process.env.EVIDENCE_DIR ?? path.join(process.cwd(), "evidence"));
const ctx = pack as unknown as Context;
const analysis = analyze(parsed, ctx);
const changes = analysis.bank;
const days = analysis.paymentRunDays;
const heldIds = changes.filter((c) => c.hold).map((c) => c.id);

describe("payment run", () => {
  it("takes its run days from the case facts", () => {
    expect(days.length).toBeGreaterThan(0);
  });
  it("blocks exactly the held changes and pays none of them", () => {
    const r = splitPaymentRun(changes, [], days);
    expect(r.blocked.map((c) => c.id).sort()).toEqual([...heldIds].sort());
    expect(r.payable.some((c) => c.hold)).toBe(false);
  });
  it("pays only changes made after the last run", () => {
    const r = splitPaymentRun(changes, [], days);
    expect(r.runs).not.toBeNull();
    expect(r.payable.every((c) => Date.parse(c.time) > r.runs!.last)).toBe(true);
    expect(r.daysToRun).toBeGreaterThan(0);
  });
  it("lets a released hold into the run, and nothing else changes", () => {
    const before = splitPaymentRun(changes, [], days);
    const id = heldIds[0];
    const after = splitPaymentRun(changes, [id], days);
    expect(after.blocked.map((c) => c.id)).not.toContain(id);
    expect(after.blocked.length).toBe(before.blocked.length - 1);
    expect(after.payable.length).toBeGreaterThanOrEqual(before.payable.length);
    const gained = after.payable.filter((c) => !before.payable.some((p) => p.id === c.id));
    expect(gained.every((c) => c.id === id)).toBe(true);
  });
  it("never pays an unreleased hold, for any combination of releases", () => {
    for (let mask = 0; mask < 1 << heldIds.length; mask++) {
      const rel = heldIds.filter((_, i) => mask & (1 << i));
      const r = splitPaymentRun(changes, rel, days);
      expect(r.payable.filter((c) => c.hold).every((c) => rel.includes(c.id))).toBe(true);
      expect(r.blocked.every((c) => !rel.includes(c.id))).toBe(true);
    }
  });
  it("ignores a release for a change that does not exist or was never held", () => {
    const base = splitPaymentRun(changes, [], days);
    const ok = changes.find((c) => !c.hold)!;
    const r = splitPaymentRun(changes, ["chg-does-not-exist", ok.id], days);
    expect(r.blocked.length).toBe(base.blocked.length);
    expect(r.payable.map((c) => c.id).sort()).toEqual(base.payable.map((c) => c.id).sort());
  });
  it("releasing the same hold twice has the same effect as once", () => {
    const id = heldIds[0];
    expect(splitPaymentRun(changes, [id, id], days).blocked.length).toBe(splitPaymentRun(changes, [id], days).blocked.length);
  });
  it("still blocks holds when no run days are known, and pays nothing", () => {
    const r = splitPaymentRun(changes, [], []);
    expect(r.runs).toBeNull();
    expect(r.payable).toEqual([]);
    expect(r.blocked.length).toBe(heldIds.length);
  });
  it("handles no bank changes at all", () => {
    expect(splitPaymentRun([], [], days)).toMatchObject({ end: 0, runs: null, blocked: [], payable: [] });
  });
  it("finds the runs around a date, including the exact run day and a month boundary", () => {
    const r = runsAround(Date.UTC(2026, 8, 8, 12), [8, 23])!;
    expect(r.last).toBe(Date.UTC(2026, 8, 8));
    expect(r.next).toBe(Date.UTC(2026, 8, 23));
    const edge = runsAround(Date.UTC(2026, 0, 30), [8, 23])!;
    expect(edge.last).toBe(Date.UTC(2026, 0, 23));
    expect(edge.next).toBe(Date.UTC(2026, 1, 8));
  });
});
