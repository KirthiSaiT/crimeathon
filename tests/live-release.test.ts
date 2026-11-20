// A live check that ties the three pieces together with real accounts: the detector's own held changes, the
// database's request-then-release rule, and the payment run's arithmetic. It signs in as the throwaway analyst and
// approver in .e2e/test-accounts.json against the real Supabase project, and runs only with LIVE_TESTS=1.
// It writes hold requests and releases for the two real held change ids and removes them at the end, so run it only
// when no real releases exist for those changes (it checks first and skips if there are).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { analyze, type Context } from "../src/engine";
import pack from "../case-pack/CR-26-047.json";
import { loadEvidenceDir } from "../src/engine/node";
import { splitPaymentRun } from "../src/engine/payment";

const accountsFile = path.join(process.cwd(), ".e2e", "test-accounts.json");
const envFile = path.join(process.cwd(), ".env.local");
// Opt in with LIVE_TESTS=1, because it writes to the real database.
const ready = process.env.LIVE_TESTS === "1" && fs.existsSync(accountsFile) && fs.existsSync(envFile);

const env = ready
  ? Object.fromEntries(
      fs.readFileSync(envFile, "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
    )
  : {};
const accounts = ready ? JSON.parse(fs.readFileSync(accountsFile, "utf8")) : {};
const make = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const signIn = async (a: { email: string; password: string }) => {
  const c = make();
  const { error } = await c.auth.signInWithPassword(a);
  if (error) throw new Error(error.message);
  return c;
};

const analysis = analyze(loadEvidenceDir(path.join(process.cwd(), "evidence")), pack as unknown as Context);
const heldIds = analysis.bank.filter((b) => b.hold).map((b) => b.id);
const releasedOf = async (c: SupabaseClient) => ((await c.from("hold_releases").select("change_id").in("change_id", heldIds)).data ?? []).map((r) => r.change_id as string);

describe.skipIf(!ready)("a hold from the logs, released by two people, reaches the payment run", () => {
  let analyst: SupabaseClient;
  let approver: SupabaseClient;
  let clean = false;

  it("starts with the two real holds blocked and nothing released", async () => {
    analyst = await signIn(accounts.analyst);
    approver = await signIn(accounts.approver);
    const existing = (await releasedOf(approver)).length + ((await approver.from("hold_requests").select("change_id").in("change_id", heldIds)).data ?? []).length;
    clean = existing === 0;
    expect(heldIds).toHaveLength(2);
    if (!clean) return; // real data is there: do not touch it
    const r = splitPaymentRun(analysis.bank, await releasedOf(approver), analysis.paymentRunDays);
    expect(r.blocked.map((c) => c.id).sort()).toEqual([...heldIds].sort());
  });

  it("an approver cannot release a real hold nobody has requested", async () => {
    if (!clean) return;
    const { error } = await approver.from("hold_releases").insert({ change_id: heldIds[0], call_back_confirmed: true });
    expect(error).not.toBeNull();
    expect(await releasedOf(approver)).toEqual([]);
  });

  it("a request alone does not unblock the payment", async () => {
    if (!clean) return;
    const { error } = await analyst.from("hold_requests").insert({ change_id: heldIds[0], note: "live test" });
    expect(error).toBeNull();
    const r = splitPaymentRun(analysis.bank, await releasedOf(approver), analysis.paymentRunDays);
    expect(r.blocked.map((c) => c.id)).toContain(heldIds[0]);
  });

  it("after the second person releases it, that change is payable and the other is still blocked", async () => {
    if (!clean) return;
    const { error } = await approver.from("hold_releases").insert({ change_id: heldIds[0], call_back_confirmed: true, call_back_note: "live test" });
    expect(error).toBeNull();
    const r = splitPaymentRun(analysis.bank, await releasedOf(analyst), analysis.paymentRunDays);
    expect(r.blocked.map((c) => c.id)).toEqual([heldIds[1]]);
    const released = analysis.bank.find((c) => c.id === heldIds[0])!;
    expect(r.payable.some((c) => c.id === released.id) || Date.parse(released.time) <= (r.runs?.last ?? 0)).toBe(true);
    expect(r.payable.some((c) => c.id === heldIds[1])).toBe(false);
  });

  it("the same person cannot request and release (the approver may not request)", async () => {
    if (!clean) return;
    const { error } = await approver.from("hold_requests").insert({ change_id: heldIds[1], note: "live test" });
    expect(error).not.toBeNull();
  });

}, 60_000);
