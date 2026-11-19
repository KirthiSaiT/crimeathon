// End-to-end test of the bank gate's approval rules against the real Supabase project, using two throwaway accounts
// (an analyst and an approver) that sign in through the real auth endpoint, so every check goes through the real
// row-level security and database functions.
//   node tests/bank-gate/run.mjs setup   creates the two accounts (passwords are random and kept in .e2e/test-accounts.json)
//   node tests/bank-gate/run.mjs test    signs in as each and runs the checks
// Between the two, the accounts are confirmed and given their roles, and two held bank changes are created through
// the simulated gateway (see tests/bank-gate/README in the report). Nothing here touches any other account.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const FILE = path.join(ROOT, ".e2e", "test-accounts.json");
const client = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

if (process.argv[2] === "setup") {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const accounts = fs.existsSync(FILE)
    ? JSON.parse(fs.readFileSync(FILE, "utf8"))
    : {
        analyst: { email: "warden.test.analyst@example.com", password: crypto.randomBytes(18).toString("base64url") + "aA1!" },
        approver: { email: "warden.test.approver@example.com", password: crypto.randomBytes(18).toString("base64url") + "aA1!" },
      };
  fs.writeFileSync(FILE, JSON.stringify(accounts, null, 2));
  for (const [role, a] of Object.entries(accounts)) {
    const { data, error } = await client().auth.signUp({ email: a.email, password: a.password });
    console.log(role, error ? `signUp error: ${error.message}` : `created (id ${data.user?.id})`);
  }
  process.exit(0);
}

const accounts = JSON.parse(fs.readFileSync(FILE, "utf8"));
const results = [];
async function check(name, fn) {
  try {
    const out = await fn();
    results.push({ name, ok: true, note: out ?? "" });
    console.log(`PASS  ${name}${out ? `  (${out})` : ""}`);
  } catch (e) {
    results.push({ name, ok: false, note: String(e.message ?? e) });
    console.log(`FAIL  ${name}\n      ${String(e.message ?? e)}`);
  }
}
const mustFail = async (p, why) => {
  const r = await p;
  if (!r.error) throw new Error(`should have been refused, but it worked (${why})`);
  return r.error.message.slice(0, 80);
};
const mustWork = async (p) => {
  const r = await p;
  if (r.error) throw new Error(r.error.message);
  return r;
};

const signIn = async (a) => {
  const c = client();
  const { error } = await c.auth.signInWithPassword(a);
  if (error) throw new Error(`sign-in failed: ${error.message}`);
  return c;
};
const analyst = await signIn(accounts.analyst);
const approver = await signIn(accounts.approver);
const anon = client();
const me = async (c) => (await c.auth.getUser()).data.user.id;
const analystId = await me(analyst);
const approverId = await me(approver);
const stamp = Date.now();

// ---- Path 1: a held change found in the logs (requests and releases are rows, guarded by row-level security)
const change = `E19-bgtest-${stamp}`;
await check("1.1 Signed-out visitor cannot read releases", async () => {
  const r = await anon.from("hold_releases").select("change_id");
  if (r.error) return "refused: " + r.error.message.slice(0, 50);
  if (r.data.length) throw new Error("a signed-out visitor could read releases");
  return "sees nothing";
});
await check("1.2 Approver cannot request a release (not their job)", async () => mustFail(approver.from("hold_requests").insert({ change_id: change }), "approver requested"));
await check("1.3 Approver cannot release a hold nobody asked for (two-person rule)", async () => mustFail(approver.from("hold_releases").insert({ change_id: change, call_back_confirmed: true }), "release without request"));
await check("1.4 Analyst cannot release a hold (not their job)", async () => mustFail(analyst.from("hold_releases").insert({ change_id: change, call_back_confirmed: true }), "analyst released"));
await check("1.5 Analyst can request a release", async () => {
  await mustWork(analyst.from("hold_requests").insert({ change_id: change, note: "bank-gate test: supplier confirmed by phone" }));
});
await check("1.6 The request is recorded with the analyst as the requester", async () => {
  const r = await mustWork(approver.from("hold_requests").select("requested_by").eq("change_id", change));
  if (r.data.length !== 1 || r.data[0].requested_by !== analystId) throw new Error("request not attributed to the analyst");
});
await check("1.7 Release without the call-back confirmed is refused", async () => mustFail(approver.from("hold_releases").insert({ change_id: change, call_back_confirmed: false }), "no call-back"));
await check("1.8 A different person (approver) can release after the request", async () => {
  await mustWork(approver.from("hold_releases").insert({ change_id: change, call_back_confirmed: true, call_back_note: "bank-gate test" }));
});
await check("1.9 The release shows up for the analyst, so the payment run will include it", async () => {
  const r = await mustWork(analyst.from("hold_releases").select("change_id").eq("change_id", change));
  if (r.data.length !== 1) throw new Error("release not visible");
});
await check("1.10 A release is not recorded as made by the person who asked", async () => {
  const r = await mustWork(approver.from("hold_releases").select("released_by").eq("change_id", change));
  if (r.data[0].released_by !== approverId || r.data[0].released_by === analystId) throw new Error("wrong releaser");
});

// ---- Path 2: a bank change a key asked for through the simulated gateway (held in the database until people decide)
const held = await mustWork(analyst.from("sim_pending_changes").select("id, vendor_id, old_last4, new_last4, status, key_name").like("key_name", "bgtest-%").eq("status", "held"));
const A = held.data.find((r) => r.key_name.startsWith("bgtest-release"));
const B = held.data.find((r) => r.key_name.startsWith("bgtest-reject"));
// Supplier accounts are only readable through the simulated gateway, with a read-only key (BGTEST_READER).
const vendor = async (_c, id) => {
  const r = (await anon.rpc("sim_api", { p_system: "ledgerone", p_secret: process.env.BGTEST_READER, p_action: "vendors.bank.read", p_params: {} })).data;
  if (!r?.ok) throw new Error(`the read key was refused: ${r?.reason}`);
  return r.data.find((v) => v.id === id).bank_last4;
};

await check("2.0 Two held changes from keys exist and neither has changed the supplier's account", async () => {
  if (!A || !B) throw new Error("the two held changes were not created");
  if ((await vendor(analyst, A.vendor_id)) !== A.old_last4) throw new Error("account changed before release");
});
if (A && B) {
  await check("2.1 Analyst cannot decide a held change", async () => mustFail(analyst.rpc("decide_sim_change", { p_id: A.id, p_release: true }), "analyst decided"));
  await check("2.2 Approver cannot release a change nobody asked for", async () => mustFail(approver.rpc("decide_sim_change", { p_id: A.id, p_release: true }), "no request"));
  await check("2.3 Approver cannot ask for a release", async () => mustFail(approver.rpc("request_sim_release", { p_id: A.id }), "approver requested"));
  await check("2.4 Analyst asks for the release", async () => {
    await mustWork(analyst.rpc("request_sim_release", { p_id: A.id, p_note: "bank-gate test: call-back done" }));
  });
  await check("2.5 A second request for the same change is refused", async () => mustFail(analyst.rpc("request_sim_release", { p_id: A.id }), "duplicate"));
  await check("2.6 The account is still the old one while it waits", async () => {
    if ((await vendor(approver, A.vendor_id)) !== A.old_last4) throw new Error("changed too early");
  });
  await check("2.7 Approver releases: the supplier's account now changes", async () => {
    await mustWork(approver.rpc("decide_sim_change", { p_id: A.id, p_release: true, p_note: "bank-gate test" }));
    const now = await vendor(approver, A.vendor_id);
    if (now !== A.new_last4) throw new Error(`expected ${A.new_last4}, found ${now}`);
    return `${A.old_last4} to ${now}`;
  });
  await check("2.8 A decided change cannot be decided again", async () => mustFail(approver.rpc("decide_sim_change", { p_id: A.id, p_release: true }), "second decision"));
  await check("2.9 Approver rejects the other change: the account stays as it was", async () => {
    await mustWork(analyst.rpc("request_sim_release", { p_id: B.id }));
    await mustWork(approver.rpc("decide_sim_change", { p_id: B.id, p_release: false, p_note: "bank-gate test: supplier denied it" }));
    const now = await vendor(approver, B.vendor_id);
    if (now !== B.old_last4) throw new Error(`account changed to ${now}`);
    return `stays ${now}`;
  });
  await check("2.10 Signed-out visitor cannot read the held changes", async () => {
    const r = await anon.from("sim_pending_changes").select("id");
    if (r.error) return "refused";
    if (r.data.length) throw new Error("a signed-out visitor could read held changes");
    return "sees nothing";
  });
}

const failed = results.filter((r) => !r.ok).length;
fs.writeFileSync(path.join(ROOT, ".e2e", "bank-gate-results.json"), JSON.stringify({ at: new Date().toISOString(), analystId, approverId, change, results }, null, 2));
console.log(`\n${results.length - failed}/${results.length} passed.`);
process.exitCode = failed ? 1 : 0;
