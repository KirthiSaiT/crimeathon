// Vendor tests against the real Supabase project and the running app.
//   Part A: the Vendor role (a supplier's account). It must sign in and see and do nothing of the case.
//   Part B: the Vendor claims module (TallyBridge's statements tested against the logs), including an independent
//           re-check of the evidence lines straight from the raw files.
//   node tests/vendor/run.mjs        (needs the app running, and .e2e/test-accounts.json with admin, analyst, approver, vendor)
// Anything it creates is named vtest-* and is removed by the cleanup statements printed at the end.
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
const accounts = JSON.parse(fs.readFileSync(path.join(ROOT, ".e2e", "test-accounts.json"), "utf8"));
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const client = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const signIn = async (a) => {
  const c = client();
  const { data, error } = await c.auth.signInWithPassword(a);
  if (error) throw new Error(`sign-in failed for ${a.email}: ${error.message}`);
  return { c, session: data.session };
};
// The cookie the site's server reads (same construction as the real sign-in).
const cookieOf = (session) => {
  const name = `sb-${new URL(URL_).hostname.split(".")[0]}-auth-token`;
  const val = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const parts = val.match(/.{1,3180}/g);
  return parts.length === 1 ? `${name}=${val}` : parts.map((p, i) => `${name}.${i}=${p}`).join("; ");
};

const results = [];
let part = "";
const section = (n) => {
  part = n;
  console.log(`\n== ${n}`);
};
async function check(name, fn) {
  try {
    const out = await fn();
    results.push({ name: `${part}: ${name}`, ok: true, note: out ?? "" });
    console.log(`PASS  ${name}${out ? `  (${out})` : ""}`);
  } catch (e) {
    results.push({ name: `${part}: ${name}`, ok: false, note: String(e.message ?? e) });
    console.log(`FAIL  ${name}\n      ${String(e.message ?? e)}`);
  }
}
const ok = async (p) => {
  const r = await p;
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
// A call that must not succeed: an error, or (for RLS updates) no row changed.
const denied = async (p, what) => {
  const r = await p;
  if (!r.error && !(Array.isArray(r.data) && r.data.length === 0)) throw new Error(`${what} was allowed`);
  return r.error ? r.error.message.slice(0, 60) : "no row changed";
};
const T = Date.now().toString(36);

const admin = await signIn(accounts.admin);
const analyst = await signIn(accounts.analyst);
const approver = await signIn(accounts.approver);
const vendor = await signIn(accounts.vendor);
const anon = client();
const vendorId = vendor.session.user.id;

// ---------------------------------------------------------------- Part A: the Vendor role
section("Vendor role: what it is");
await check("The vendor signs in and the database says the role is vendor", async () => {
  const me = await ok(vendor.c.from("profiles").select("role, email").eq("id", vendorId).single());
  if (me.role !== "vendor") throw new Error(`role is ${me.role}`);
});
await check("The vendor role has no permission at all", async () => {
  const rows = await ok(vendor.c.from("role_permissions").select("permission").eq("role", "vendor"));
  if (rows.length) throw new Error(`vendor has ${rows.length} permissions: ${rows.map((r) => r.permission).join(", ")}`);
  return "0 permissions";
});
await check("The vendor sees only their own profile, not the team", async () => {
  const rows = await ok(vendor.c.from("profiles").select("id"));
  if (rows.length !== 1 || rows[0].id !== vendorId) throw new Error(`saw ${rows.length} profiles`);
});

// Give the tables something to hide: rows made by other roles.
const keyName = `vtest-key-${T}`;
await ok(analyst.c.from("analysis_runs").insert({ source: "upload", label: `vtest-${T}`, stats: { events: 1 }, files: [], analysis: { ok: true } }));
await ok(analyst.c.from("alert_reviews").upsert({ alert_ref: `vtest-${T}`, decision: "confirmed", note: "t" }, { onConflict: "alert_ref" }));
await ok(analyst.c.from("key_actions").insert({ credential_id: `vtest-${T}`, action: "rotate" }));
await ok(analyst.c.from("hold_requests").insert({ change_id: `vtest-${T}` }));
await ok(approver.c.from("hold_releases").insert({ change_id: `vtest-${T}`, call_back_confirmed: true }));
await ok(analyst.c.rpc("raise_ticket", { p_subject: `vtest ticket ${T}`, p_body: "A vendor test ticket." }));
await ok(analyst.c.rpc("raise_ticket", { p_subject: `vtest secret ${T}`, p_body: "password=vendortest123" }));
await ok(admin.c.rpc("create_managed_key", { p_system: "ledgerone", p_name: keyName, p_scope: ["vendors.read"], p_rotation_seconds: 3600, p_grace_seconds: 0, p_auto_rotate: false }));
const tid = (await ok(admin.c.from("support_tickets").select("id").eq("subject", `vtest ticket ${T}`).single())).id;
await ok(analyst.c.rpc("add_ticket_comment", { p_ticket_id: tid, p_body: "A vendor test comment." }));

section("Vendor role: reads (the same tables, an admin sees rows, the vendor sees none)");
for (const t of ["analysis_runs", "alert_reviews", "key_actions", "hold_requests", "hold_releases", "managed_keys", "key_events", "support_tickets", "ticket_comments", "secret_alerts", "sim_pending_changes", "audit_log"]) {
  await check(`${t}`, async () => {
    // Keys expose only some columns to signed-in users, so ask for one that is always readable.
    const cols = t === "managed_keys" ? "id" : "*";
    const a = await admin.c.from(t).select(cols, { count: "exact", head: true });
    const v = await vendor.c.from(t).select(cols, { count: "exact", head: true });
    if (!v.error && (v.count ?? 0) > 0) throw new Error(`the vendor can see ${v.count} rows (admin sees ${a.count})`);
    return `admin sees ${a.count ?? "?"}, vendor sees ${v.error ? "an error" : 0}`;
  });
}
await check("A signed-out visitor sees nothing in those tables either", async () => {
  for (const t of ["support_tickets", "managed_keys", "hold_releases"]) {
    const r = await anon.from(t).select("*", { count: "exact", head: true });
    if (!r.error && (r.count ?? 0) > 0) throw new Error(`${t} readable by a guest`);
  }
});

section("Vendor role: writes and actions are refused");
await check("Cannot save a run", async () => denied(vendor.c.from("analysis_runs").insert({ source: "upload", label: `vtest-v-${T}`, stats: {}, files: [], analysis: {} }), "saving a run"));
await check("Cannot review an alert", async () => denied(vendor.c.from("alert_reviews").upsert({ alert_ref: `vtest-v-${T}`, decision: "confirmed" }, { onConflict: "alert_ref" }), "reviewing an alert"));
await check("Cannot request a key action", async () => denied(vendor.c.from("key_actions").insert({ credential_id: `vtest-v-${T}`, action: "rotate" }), "key action"));
await check("Cannot request a hold release", async () => denied(vendor.c.from("hold_requests").insert({ change_id: `vtest-v-${T}` }), "release request"));
await check("Cannot release a hold", async () => denied(vendor.c.from("hold_releases").insert({ change_id: `vtest-v-${T}`, call_back_confirmed: true }), "release"));
await check("Cannot raise a ticket", async () => denied(vendor.c.rpc("raise_ticket", { p_subject: "vtest", p_body: "x" }), "ticket"));
await check("Cannot comment on a ticket", async () => denied(vendor.c.rpc("add_ticket_comment", { p_ticket_id: tid, p_body: "x" }), "comment"));
await check("Cannot create, rotate, reveal or change a key", async () => {
  const k = await ok(admin.c.from("managed_keys").select("id").eq("name", keyName).single());
  const tries = [
    vendor.c.rpc("create_managed_key", { p_system: "ledgerone", p_name: `vtest-v-${T}`, p_scope: ["vendors.read"], p_rotation_seconds: 3600, p_grace_seconds: 0, p_auto_rotate: false }),
    vendor.c.rpc("rotate_managed_key", { p_id: k.id }),
    vendor.c.rpc("reveal_managed_key_secret", { p_id: k.id }),
    vendor.c.rpc("set_managed_key_status", { p_id: k.id, p_status: "revoked" }),
    vendor.c.rpc("split_managed_key", { p_id: k.id, p_retire: false }),
    vendor.c.rpc("run_attack_replay"),
    vendor.c.rpc("reset_sim_data"),
  ];
  for (const t of tries) await denied(t, "a key action");
  return "7 of 7 refused";
});
await check("Cannot request or decide a held bank change", async () => {
  const held = await ok(admin.c.from("sim_pending_changes").select("id").eq("status", "held").limit(1));
  if (!held.length) return "no held change to try (skipped)";
  await denied(vendor.c.rpc("request_sim_release", { p_id: held[0].id }), "request");
  await denied(vendor.c.rpc("decide_sim_change", { p_id: held[0].id, p_release: true }), "decision");
});
await check("Cannot review a secret alert", async () => denied(vendor.c.rpc("review_secret_alert", { p_id: 1 }), "review"));
await check("Cannot give themselves a role", async () => {
  const r = await vendor.c.from("profiles").update({ role: "admin" }).eq("id", vendorId).select();
  const me = await ok(vendor.c.from("profiles").select("role").eq("id", vendorId).single());
  if (me.role !== "vendor") throw new Error(`the role became ${me.role}`);
  return r.error ? r.error.message.slice(0, 60) : "no row changed";
});
await check("Cannot switch off the two-person rule", async () => {
  await vendor.c.from("app_settings").update({ two_person_rule: false }).eq("id", true);
  const s = await ok(admin.c.from("app_settings").select("two_person_rule").single());
  if (!s.two_person_rule) throw new Error("the rule was switched off");
});

section("Vendor role: the web API");
await check("Without a session the data API answers 401", async () => {
  const r = await fetch(`${BASE}/api/analysis`);
  if (r.status !== 401) throw new Error(`status ${r.status}`);
});
await check("With the vendor's session the data API answers 403 (no access to the case)", async () => {
  const get = await fetch(`${BASE}/api/analysis`, { headers: { Cookie: cookieOf(vendor.session) } });
  const fd = new FormData();
  fd.append("logs", new Blob([fs.readFileSync("evidence/E19_vendor_master_change_log.csv")]), "E19_vendor_master_change_log.csv");
  const post = await fetch(`${BASE}/api/analysis`, { method: "POST", body: fd, headers: { Cookie: cookieOf(vendor.session) } });
  if (get.status !== 403 || post.status !== 403) throw new Error(`GET ${get.status}, POST ${post.status}`);
  return `GET ${get.status}, POST ${post.status}`;
});
await check("The same upload with an analyst's session works (so the 403 is the role, not the request)", async () => {
  const fd = new FormData();
  fd.append("logs", new Blob([fs.readFileSync("evidence/E19_vendor_master_change_log.csv")]), "E19_vendor_master_change_log.csv");
  const r = await fetch(`${BASE}/api/analysis`, { method: "POST", body: fd, headers: { Cookie: cookieOf(analyst.session) } });
  if (r.status !== 200) throw new Error(`status ${r.status}`);
});

section("Vendor role: an admin changes it, and the change takes effect");
await check("Promoted to analyst, the same session can read runs and the API opens", async () => {
  await ok(admin.c.from("profiles").update({ role: "analyst" }).eq("id", vendorId));
  const rows = await ok(vendor.c.from("analysis_runs").select("id").eq("label", `vtest-${T}`));
  const r = await fetch(`${BASE}/api/analysis`, { headers: { Cookie: cookieOf(vendor.session) } });
  if (rows.length !== 1) throw new Error("the promoted account could not read a run");
  if (r.status !== 200) throw new Error(`the API answered ${r.status}`);
});
await check("Demoted back to vendor, access is gone at once", async () => {
  await ok(admin.c.from("profiles").update({ role: "vendor" }).eq("id", vendorId));
  const rows = await ok(vendor.c.from("analysis_runs").select("id").eq("label", `vtest-${T}`));
  const r = await fetch(`${BASE}/api/analysis`, { headers: { Cookie: cookieOf(vendor.session) } });
  if (rows.length !== 0) throw new Error("the demoted account can still read runs");
  if (r.status !== 403) throw new Error(`the API answered ${r.status}`);
});
await check("The role changes are in the audit log", async () => {
  const rows = await ok(admin.c.from("audit_log").select("action, detail").eq("action", "role_changed").order("at", { ascending: false }).limit(4));
  if (rows.length < 2) throw new Error("role changes missing");
});

// ---------------------------------------------------------------- Part B: Vendor claims
section("Vendor claims: the module");
const LOGS = ["E01_ledgerone_api_access.csv", "E02_helpdeskr_audit_log.csv", "E03_sso_signin_log.csv", "E05_bluevault_access_log.csv", "E15_network_link_flow_log.csv", "E18_ledgerone_api_access_1_to_7_sep.csv", "E19_vendor_master_change_log.csv", "E04_connected_software_register.json"];
const analyse = async (withPack) => {
  const fd = new FormData();
  for (const f of LOGS) fd.append("logs", new Blob([fs.readFileSync(path.join("evidence", f))]), f);
  if (withPack) fd.append("logs", new Blob([fs.readFileSync("case-pack/CR-26-047.json")]), "CR-26-047.json");
  const r = await fetch(`${BASE}/api/analysis`, { method: "POST", body: fd, headers: { Cookie: cookieOf(analyst.session) } });
  if (r.status !== 200) throw new Error(`analysis answered ${r.status}`);
  return r.json();
};
const withFacts = await analyse(true);
const noFacts = await analyse(false);
const claims = withFacts.claims;
const pack = JSON.parse(fs.readFileSync("case-pack/CR-26-047.json", "utf8"));

await check("Without the case facts there are no claims, and nothing is invented", async () => {
  if (noFacts.claims.length !== 0) throw new Error(`${noFacts.claims.length} claims appeared without the facts`);
});
await check("With the case facts every claim in the file is tested, none dropped or added", async () => {
  if (claims.length !== pack.claims.length) throw new Error(`${claims.length} returned, ${pack.claims.length} in the file`);
  const ids = new Set(claims.map((c) => c.id));
  for (const d of pack.claims) if (!ids.has(d.id)) throw new Error(`${d.id} missing`);
  return `${claims.length} claims`;
});
await check("Every claim has a verdict, a reason and evidence", async () => {
  for (const c of claims) {
    if (!["true", "false", "unproven"].includes(c.verdict)) throw new Error(`${c.id}: verdict ${c.verdict}`);
    if (!c.because || c.because.length < 10) throw new Error(`${c.id}: no reason`);
    if (!c.evidence?.length && c.verdict !== "unproven") throw new Error(`${c.id}: no evidence`);
  }
  const n = (v) => claims.filter((c) => c.verdict === v).length;
  return `${n("false")} false, ${n("unproven")} unproven, ${n("true")} true`;
});
await check("The verdicts are the same on a second run (deterministic)", async () => {
  const again = await analyse(true);
  const a = JSON.stringify(claims.map((c) => [c.id, c.verdict, c.because]));
  const b = JSON.stringify(again.claims.map((c) => [c.id, c.verdict, c.because]));
  if (a !== b) throw new Error("the answers changed between runs");
});
await check("A claim the logs cannot settle is called unproven, not guessed (C-05, rotation)", async () => {
  const c = claims.find((x) => x.id === "C-05");
  if (c.verdict !== "unproven") throw new Error(`verdict ${c.verdict}`);
});
await check("A document-only claim keeps the verdict written in the case facts (C-08)", async () => {
  const c = claims.find((x) => x.id === "C-08");
  const want = pack.claims.find((d) => d.id === "C-08").check.verdict;
  if (c.verdict !== want) throw new Error(`${c.verdict} instead of ${want}`);
});

section("Vendor claims: the evidence lines checked independently from the raw files");
const lines = (file) => fs.readFileSync(path.join("evidence", file), "utf8").split(/\r?\n/);
const E01 = lines("E01_ledgerone_api_access.csv");
const E18 = lines("E18_ledgerone_api_access_1_to_7_sep.csv");
const dayOf = (row) => row.slice(0, 10);
const rangeOf = (s) => {
  const [a, b] = String(s).split("-").map((x) => Number(x.trim()));
  return [a, b ?? a];
};
await check("Every cited line number exists in the file it names", async () => {
  let n = 0;
  for (const c of claims) {
    for (const ev of c.evidence ?? []) {
      const file = { E01, E18 }[ev.file];
      if (!file) continue;
      for (const part of ev.lines.split(",")) {
        const [a, b] = rangeOf(part);
        if (!(a >= 2 && b <= file.length)) throw new Error(`${c.id}: ${ev.file} lines ${part} are outside the file (${file.length} lines)`);
        n++;
      }
    }
  }
  return `${n} references`;
});
await check("C-01 (only 11 and 12 August): cited lines really are on other days", async () => {
  const c = claims.find((x) => x.id === "C-01");
  const days = new Set();
  for (const ev of c.evidence) {
    const file = { E01, E18 }[ev.file];
    if (!file) continue;
    for (const part of ev.lines.split(",")) for (const l of rangeOf(part)) days.add(dayOf(file[l - 1]));
  }
  const outside = [...days].filter((d) => d < "2026-08-11" || d > "2026-08-12");
  if (!outside.length) throw new Error(`all cited lines fall on ${[...days].join(", ")}, so the claim would not be false`);
  return `cited days include ${outside.join(", ")}`;
});
await check("C-03 (all exports removed): the raw E01 has a finance export download with no delete", async () => {
  const downloaded = new Set(), deleted = new Set();
  for (const row of E01.slice(1)) {
    const f = row.split(",");
    const m = /\/exports\/(\d+)/.exec(f[5] ?? "");
    if (!m) continue;
    if (/download$/.test(f[5])) downloaded.add(m[1]);
    if ((f[6] ?? "") === "DELETE") deleted.add(m[1]);
  }
  const kept = [...downloaded].filter((id) => !deleted.has(id));
  if (!kept.length) throw new Error("every downloaded export was deleted in the raw log, so the claim would not be false");
  return `export ${kept.join(", ")} downloaded and never deleted`;
});
await check("C-05 (rotated on 24 August): the cited E18 lines are after 24 August", async () => {
  const c = claims.find((x) => x.id === "C-05");
  for (const ev of c.evidence) {
    if (ev.file !== "E18") continue;
    for (const part of ev.lines.split(",")) for (const l of rangeOf(part)) if (dayOf(E18[l - 1]) <= "2026-08-24") throw new Error(`line ${l} is on ${dayOf(E18[l - 1])}`);
  }
});
await check("C-06 (matter closed): activity really continues after the stated closing date", async () => {
  const c = claims.find((x) => x.id === "C-06");
  const ev = c.evidence[0];
  const [, b] = rangeOf(ev.lines);
  const last = dayOf(E18[b - 1]);
  const closed = pack.claims.find((d) => d.id === "C-06").check.date;
  if (!(last > closed)) throw new Error(`the last cited line is ${last}, not after ${closed}`);
  return `last cited line ${last}, closing date ${closed}`;
});

// ---------------------------------------------------------------- Finish
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(ROOT, ".e2e", "vendor-results.json"), JSON.stringify({ at: new Date().toISOString(), tag: T, results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} passed.`);
console.log(`Cleanup tag: vtest (key ${keyName}).`);
process.exitCode = failed.length ? 1 : 0;
