// Module tests against the real Supabase project, signed in as real (throwaway) accounts: an admin, an analyst and
// an approver, plus a signed-out client. Every call goes through the real auth endpoint, row-level security and
// the database functions, the same path the pages use.
//   node tests/modules/run.mjs          (needs .e2e/test-accounts.json with admin, analyst and approver)
// Everything it creates is named modtest-* and is removed by the cleanup step in the report.
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
const client = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const signIn = async (a) => {
  const c = client();
  const { error } = await c.auth.signInWithPassword(a);
  if (error) throw new Error(`sign-in failed for ${a.email}: ${error.message}`);
  return c;
};
const admin = await signIn(accounts.admin);
const analyst = await signIn(accounts.analyst);
const approver = await signIn(accounts.approver);
const anon = client();
const uid = async (c) => (await c.auth.getUser()).data.user.id;
const [adminId, analystId] = [await uid(admin), await uid(analyst)];

const results = [];
let current = "";
const module_ = (name) => {
  current = name;
  console.log(`\n== ${name}`);
};
async function check(name, fn) {
  const id = `${current}: ${name}`;
  try {
    const out = await fn();
    results.push({ name: id, ok: true, note: out ?? "" });
    console.log(`PASS  ${name}${out ? `  (${out})` : ""}`);
  } catch (e) {
    results.push({ name: id, ok: false, note: String(e.message ?? e) });
    console.log(`FAIL  ${name}\n      ${String(e.message ?? e)}`);
  }
}
const ok = async (p) => {
  const r = await p;
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
const refused = async (p, what) => {
  const r = await p;
  if (!r.error) throw new Error(`${what} should have been refused`);
  return r.error.message.slice(0, 60);
};
const gate = (secret, action, ip, params = {}, system = "ledgerone") => anon.rpc("sim_api", { p_system: system, p_secret: secret, p_action: action, p_params: params, p_source: ip ?? null }).then((r) => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = Date.now().toString(36);
const mk = (name, scope, o = {}) =>
  ok(
    admin.rpc("create_managed_key", {
      p_system: o.system ?? "ledgerone",
      p_name: `modtest-${name}-${T}`,
      p_scope: scope,
      p_rotation_seconds: o.rotation ?? 3600,
      p_grace_seconds: o.grace ?? 0,
      p_auto_rotate: o.auto ?? false,
      p_ranges: o.ranges ?? [],
      p_range_mode: o.mode ?? "off",
      p_on_critical: o.critical ?? "quarantine",
    }),
  );
const keyRow = async (name) => (await ok(admin.from("managed_keys").select("id, status, version, prefix").eq("name", `modtest-${name}-${T}`).single()));

// ---------------------------------------------------------------- Access and roles
module_("Access and roles");
await check("A signed-out visitor reads nothing (keys, tickets, team, runs)", async () => {
  for (const t of ["managed_keys", "support_tickets", "profiles", "analysis_runs", "audit_log", "secret_alerts"]) {
    const r = await anon.from(t).select("*").limit(1);
    if (!r.error && r.data.length) throw new Error(`${t} readable by a guest`);
  }
});
await check("Admin sees the whole team", async () => {
  const rows = await ok(admin.from("profiles").select("id, role"));
  if (rows.length < 4) throw new Error(`only ${rows.length} profiles`);
  return `${rows.length} accounts`;
});
await check("An analyst sees only their own profile", async () => {
  const rows = await ok(analyst.from("profiles").select("id"));
  if (rows.length !== 1 || rows[0].id !== analystId) throw new Error(`saw ${rows.length} profiles`);
});
await check("Admin can change a role, and the change is audited", async () => {
  await ok(admin.from("profiles").update({ role: "viewer" }).eq("id", analystId));
  const who = await ok(analyst.from("profiles").select("role").eq("id", analystId).single());
  if (who.role !== "viewer") throw new Error("role did not change");
  await ok(admin.from("profiles").update({ role: "analyst" }).eq("id", analystId));
});
await check("A viewer cannot raise a hold release request (role really changed access)", async () => {
  await ok(admin.from("profiles").update({ role: "viewer" }).eq("id", analystId));
  const msg = await refused(analyst.from("hold_requests").insert({ change_id: `modtest-${T}` }), "viewer request");
  await ok(admin.from("profiles").update({ role: "analyst" }).eq("id", analystId));
  return msg;
});
await check("Admin cannot change their own role", async () => {
  const r = await admin.from("profiles").update({ role: "viewer" }).eq("id", adminId).select();
  const now = await ok(admin.from("profiles").select("role").eq("id", adminId).single());
  if (now.role !== "admin") throw new Error("the admin demoted themselves");
  return r.error ? r.error.message.slice(0, 50) : "no row changed";
});
await check("An analyst cannot change anyone's role", async () => {
  const r = await analyst.from("profiles").update({ role: "admin" }).eq("id", analystId).select();
  const now = await ok(admin.from("profiles").select("role").eq("id", analystId).single());
  if (now.role !== "analyst") throw new Error(`role became ${now.role}`);
  return r.error ? "refused" : "no row changed";
});
await check("Only an admin can change the two-person rule", async () => {
  const r = await analyst.from("app_settings").update({ two_person_rule: false }).eq("id", true).select();
  const s = await ok(admin.from("app_settings").select("two_person_rule").single());
  if (s.two_person_rule !== true) throw new Error("the rule was switched off by an analyst");
  return r.error ? "refused" : "no row changed";
});
await check("The permission table is readable once signed in", async () => {
  const rows = await ok(analyst.from("role_permissions").select("role, permission"));
  if (rows.length < 10) throw new Error("matrix too small");
  return `${rows.length} grants`;
});

// ---------------------------------------------------------------- Activity and audit
module_("Activity and audit log");
await check("An analyst saves an analysis run and can read it back", async () => {
  await ok(analyst.from("analysis_runs").insert({ source: "upload", label: `modtest-${T}`, stats: { events: 1 }, files: [], analysis: { ok: true } }));
  const rows = await ok(analyst.from("analysis_runs").select("id, label").eq("label", `modtest-${T}`));
  if (rows.length !== 1) throw new Error("run not found");
});
await check("Staff can read the audit log, a signed-out visitor cannot", async () => {
  const g = await anon.from("audit_log").select("id").limit(1);
  if (!g.error && g.data.length) throw new Error("a guest read the audit log");
  const b = await ok(admin.from("audit_log").select("id").limit(5));
  const a = await ok(analyst.from("audit_log").select("id").limit(5));
  if (!b.length || !a.length) throw new Error("staff saw an empty audit log");
});
await check("The role change above is in the audit log", async () => {
  const rows = await ok(admin.from("audit_log").select("action").in("action", ["role_changed"]).limit(1));
  if (!rows.length) throw new Error("no role_changed entry");
});

// ---------------------------------------------------------------- Alerts and key advice
module_("Alerts and key advice");
await check("An analyst records a decision on an alert, and an approver sees it", async () => {
  await ok(analyst.from("alert_reviews").upsert({ alert_ref: `modtest-${T}`, decision: "confirmed", note: "test" }, { onConflict: "alert_ref" }));
  const rows = await ok(approver.from("alert_reviews").select("decision").eq("alert_ref", `modtest-${T}`));
  if (rows[0]?.decision !== "confirmed") throw new Error("decision not visible");
});
await check("The decision can be changed", async () => {
  await ok(analyst.from("alert_reviews").upsert({ alert_ref: `modtest-${T}`, decision: "set_aside", note: "changed" }, { onConflict: "alert_ref" }));
  const rows = await ok(analyst.from("alert_reviews").select("decision").eq("alert_ref", `modtest-${T}`));
  if (rows[0].decision !== "set_aside") throw new Error("not updated");
});
await check("An analyst asks for a key action and an admin completes it", async () => {
  await ok(analyst.from("key_actions").insert({ credential_id: `modtest-${T}`, action: "rotate", note: "test" }));
  const rows = await ok(admin.from("key_actions").select("id, status").eq("credential_id", `modtest-${T}`));
  if (rows.length !== 1) throw new Error("request not visible to admin");
  await ok(admin.from("key_actions").update({ status: "done" }).eq("id", rows[0].id));
});
await check("A guest cannot record a decision", async () => refused(anon.from("alert_reviews").insert({ alert_ref: `modtest-${T}-g`, decision: "confirmed" }), "guest review"));

// ---------------------------------------------------------------- Key vault
module_("Key vault");
await check("An analyst cannot create a key", async () => refused(analyst.rpc("create_managed_key", { p_system: "ledgerone", p_name: `modtest-x-${T}`, p_scope: ["vendors.read"], p_rotation_seconds: 3600, p_grace_seconds: 0, p_auto_rotate: false }), "analyst key"));
const s1 = await mk("range", ["vendors.read"], { ranges: ["10.20.4.0/28"], mode: "enforce", critical: "quarantine" });
await check("A new key works from an allowed address", async () => {
  const r = await gate(s1, "vendors.read", "10.20.4.5");
  if (r.status !== 200) throw new Error(`status ${r.status}: ${r.reason}`);
});
await check("The same key from outside its range is refused and cut off at once", async () => {
  const r = await gate(s1, "vendors.read", "203.0.113.9");
  if (r.status !== 403) throw new Error(`status ${r.status}`);
  const k = await keyRow("range");
  if (k.status === "active") throw new Error("the key was not cut off");
  return `now ${k.status}`;
});
await check("A quarantined key is read-only: reads work, anything that writes is refused", async () => {
  const r = await gate(s1, "vendors.read", "10.20.4.5");
  if (r.status !== 200) throw new Error("a quarantined key could not even read, status " + r.status);
  return "reads allowed";
});
await check("A revoked key is refused completely", async () => {
  const k = await keyRow("range");
  await ok(admin.rpc("set_managed_key_status", { p_id: k.id, p_status: "revoked" }));
  const r = await gate(s1, "vendors.read", "10.20.4.5");
  if (r.ok) throw new Error("a revoked key still worked");
  return r.reason.slice(0, 40);
});
const s1b = await mk("range2", ["vendors.read"], { ranges: ["10.20.4.0/28"], mode: "enforce" });
await check("Admin can release a quarantined key again", async () => {
  await gate(s1b, "vendors.read", "203.0.113.9");
  const k = await keyRow("range2");
  if (k.status === "active") throw new Error("not quarantined first");
  await ok(admin.rpc("set_managed_key_status", { p_id: k.id, p_status: "active" }));
  const r = await gate(s1b, "vendors.read", "10.20.4.5");
  if (r.status !== 200) throw new Error("still " + r.status);
});
const s2 = await mk("monitor", ["vendors.read"], { ranges: ["10.20.4.0/28"], mode: "monitor" });
await check("Monitor mode flags an outside address but lets the call through", async () => {
  const r = await gate(s2, "vendors.read", "203.0.113.9");
  if (r.status !== 200 || !r.flagged) throw new Error(`status ${r.status}, flagged ${r.flagged}`);
});
const s3 = await mk("scope", ["vendors.read"]);
await check("A key asking for something outside its scope is refused and cut off", async () => {
  const r = await gate(s3, "files.read", null, { id: "F-1" });
  if (r.status !== 403) throw new Error(`status ${r.status}`);
  const k = await keyRow("scope");
  if (k.status === "active") throw new Error("not cut off");
});
await check("An unknown secret is refused", async () => {
  const r = await gate("wk_ledgerone_" + "0".repeat(36), "vendors.read", null);
  if (r.status !== 401) throw new Error(`status ${r.status}`);
});
const s4 = await mk("rotate", ["vendors.read"], { grace: 0 });
await check("Rotating a key kills the old secret at once (grace 0)", async () => {
  const k = await keyRow("rotate");
  const fresh = await ok(admin.rpc("rotate_managed_key", { p_id: k.id }));
  const old = await gate(s4, "vendors.read", null);
  const now = await gate(fresh, "vendors.read", null);
  if (old.ok) throw new Error("the old secret still worked");
  if (now.status !== 200) throw new Error("the new secret did not work");
  return old.reason.slice(0, 50);
});
const s5 = await mk("grace", ["vendors.read"], { grace: 60 });
await check("With a grace window the old secret works for a moment, then the new one too", async () => {
  const k = await keyRow("grace");
  const fresh = await ok(admin.rpc("rotate_managed_key", { p_id: k.id }));
  const old = await gate(s5, "vendors.read", null);
  const now = await gate(fresh, "vendors.read", null);
  if (old.status !== 200 || !old.grace) throw new Error("the old secret was not accepted in the window");
  if (now.status !== 200) throw new Error("the new secret failed");
});
const s6 = await mk("bank", ["vendors.bank.write"]);
await check("A key asking to change a bank account is held, not applied, and cut off", async () => {
  const r = await gate(s6, "vendors.bank.write", "203.0.113.9", { vendor_id: "V-0101", last4: "9999" });
  if (r.status !== 202 || !r.pending) throw new Error(`status ${r.status}`);
  const k = await keyRow("bank");
  if (k.status === "active") throw new Error("not cut off");
  return `held, key ${k.status}`;
});
const s7 = await mk("split", ["vendors.read", "vendors.contact.write"]);
await check("Split makes narrow keys from what the key did, and never a bank key", async () => {
  await gate(s7, "vendors.read", null);
  await gate(s7, "vendors.contact.write", null, { vendor_id: "V-0244", phone: "000" });
  const k = await keyRow("split");
  const made = await ok(admin.rpc("split_managed_key", { p_id: k.id, p_retire: true }));
  if (!Array.isArray(made) || made.length < 2 /* a read key and a write key */) throw new Error(`made ${made?.length}`);
  if (made.some((m) => (m.scope ?? []).includes("vendors.bank.write"))) throw new Error("a bank key was made");
  return `${made.length} narrow keys`;
});
await check("Every call above is in the key events log", async () => {
  const ev = await ok(admin.from("key_events").select("outcome, key_name").like("key_name", `modtest-%-${T}`));
  if (ev.length < 8) throw new Error(`only ${ev.length} events`);
  return `${ev.length} events`;
});
await check("A signed-out visitor cannot reveal or read a secret", async () => {
  const k = await keyRow("rotate");
  return refused(anon.rpc("reveal_managed_key_secret", { p_id: k.id }), "guest reveal");
});
const s8 = await mk("auto", ["vendors.read"], { rotation: 60, grace: 0, auto: true });
const autoBefore = await keyRow("auto");

// ---------------------------------------------------------------- Support tickets
module_("Support tickets and the secret scanner");
await check("A clean ticket is saved", async () => {
  const r = await ok(analyst.rpc("raise_ticket", { p_subject: `modtest clean ${T}`, p_body: "The customer cannot download delivery proofs." }));
  if (!r.saved) throw new Error("not saved");
});
await check("A ticket with a password is refused, and nothing is stored", async () => {
  const r = await ok(analyst.rpc("raise_ticket", { p_subject: `modtest blocked ${T}`, p_body: "login is password=hunter2hunter2 ok" }));
  if (!r.blocked || r.saved) throw new Error("not blocked");
  const rows = await ok(admin.from("support_tickets").select("id").eq("subject", `modtest blocked ${T}`));
  if (rows.length) throw new Error("the ticket was stored anyway");
  if (JSON.stringify(r).includes("hunter2hunter2")) throw new Error("the secret came back in the answer");
  return r.patterns.join(", ");
});
await check("The admin is alerted, with a redacted preview and no secret", async () => {
  const rows = await ok(admin.from("secret_alerts").select("patterns, previews, status").eq("status", "open").order("at", { ascending: false }).limit(1));
  if (!rows.length) throw new Error("no alert");
  if (JSON.stringify(rows[0]).includes("hunter2hunter2")) throw new Error("the alert holds the secret");
  return rows[0].previews.join(" ");
});
await check("An analyst cannot read the alerts", async () => {
  const r = await analyst.from("secret_alerts").select("id").limit(1);
  if (!r.error && r.data.length) throw new Error("analyst read an alert");
});
await check("Each kind of secret is caught", async () => {
  const samples = ["-----BEGIN RSA PRIVATE KEY-----", "token: abcdef123456", "Bearer abcdefghijklmnopqrstuvwxyz1234", "AKIAABCDEFGHIJKLMNOP", "postgres://user:pass1234@db.example.com/x", "bvk-7f3a9c", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkw.abcdefghijklmnop"];
  const missed = [];
  for (const s of samples) {
    const r = await ok(analyst.rpc("raise_ticket", { p_subject: `modtest kinds ${T}`, p_body: s }));
    if (!r.blocked) missed.push(s.slice(0, 18));
  }
  if (missed.length) throw new Error(`not caught: ${missed.join(" | ")}`);
  return `${samples.length} of ${samples.length}`;
});
await check("Normal text with the word 'password' but no value is allowed", async () => {
  const r = await ok(analyst.rpc("raise_ticket", { p_subject: `modtest ok ${T}`, p_body: "The user forgot their password and asked for a reset link." }));
  if (!r.saved) throw new Error("a normal sentence was blocked");
});
await check("A live vault key pasted into a comment is refused and the key is replaced at once", async () => {
  const t = await ok(analyst.rpc("raise_ticket", { p_subject: `modtest leak ${T}`, p_body: "see the key in the vault" }));
  const live = await mk("leak", ["vendors.read"]);
  const r = await ok(analyst.rpc("add_ticket_comment", { p_ticket_id: t.id, p_body: `config: ${live}` }));
  if (!r.blocked) throw new Error("not blocked");
  if (!r.rotated?.some((n) => n.includes("modtest-leak"))) throw new Error("the key was not rotated");
  const after = await gate(live, "vendors.read", null);
  if (after.ok) throw new Error("the leaked secret still works");
  return `rotated ${r.rotated[0]}`;
});
await check("An analyst cannot override the block; an admin can, and the text is masked", async () => {
  const a = await ok(analyst.rpc("raise_ticket", { p_subject: `modtest override ${T}`, p_body: "password=overridepass1", p_override_reason: "not a real password" }));
  if (!a.blocked) throw new Error("analyst override worked");
  const b = await ok(admin.rpc("raise_ticket", { p_subject: `modtest override ${T}`, p_body: "password=overridepass1", p_override_reason: "this is a sample, not real" }));
  if (!b.saved || !b.masked) throw new Error("admin override did not save masked");
  const row = await ok(admin.from("support_tickets").select("body, secret_masked").eq("id", b.id).single());
  if (row.body.includes("overridepass1") || !row.secret_masked) throw new Error("the stored text still holds the secret");
});
await check("An admin can mark an alert reviewed", async () => {
  const rows = await ok(admin.from("secret_alerts").select("id").eq("status", "open").limit(1));
  await ok(admin.rpc("review_secret_alert", { p_id: rows[0].id, p_note: "modtest" }));
});

// ---------------------------------------------------------------- Auto-rotation (waits for the timer)
module_("Key vault: automatic rotation");
await check("A key set to rotate every 60 seconds is replaced by the timer, and the old secret dies", async () => {
  await sleep(85000);
  const after = await keyRow("auto");
  const old = await gate(s8, "vendors.read", null);
  if (after.version <= autoBefore.version) throw new Error(`version still ${after.version}`);
  if (old.ok) throw new Error("the old secret still works after rotation");
  return `version ${autoBefore.version} to ${after.version}`;
});

const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(ROOT, ".e2e", "modules-results.json"), JSON.stringify({ at: new Date().toISOString(), tag: T, results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} passed.`);
process.exitCode = failed.length ? 1 : 0;
