// Selenium end-to-end tests and load-time measurements for Warden.
//   node tests/e2e/run.mjs            (BASE_URL defaults to a production server on http://localhost:3100)
// Writes docs/selenium/results.json, screenshots, and docs/selenium/report.html.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Builder, By, logging } from "selenium-webdriver";
import edge from "selenium-webdriver/edge.js";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const ROOT = process.cwd();
const EVID = path.join(ROOT, "evidence");
const PACK = path.join(ROOT, "case-pack", "CR-26-047.json");
const OUT = process.env.E2E_OUT ? path.resolve(process.env.E2E_OUT) : path.join(ROOT, "docs", "selenium");
const SHOTS = path.join(OUT, "screenshots");
fs.rmSync(SHOTS, { recursive: true, force: true }); // start from a clean set of screenshots
fs.mkdirSync(SHOTS, { recursive: true });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "warden-e2e-"));

const LOGS = [
  "E01_ledgerone_api_access.csv",
  "E02_helpdeskr_audit_log.csv",
  "E03_sso_signin_log.csv",
  "E05_bluevault_access_log.csv",
  "E15_network_link_flow_log.csv",
  "E18_ledgerone_api_access_1_to_7_sep.csv",
  "E19_vendor_master_change_log.csv",
  "E04_connected_software_register.json",
].map((f) => path.join(EVID, f));
const ev = (f) => path.join(EVID, f);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Number(process.hrtime.bigint()) / 1e6;
const round = (n) => Math.round(n * 10) / 10;
function stats(a) {
  const s = [...a].sort((x, y) => x - y);
  const q = (p) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
  return { n: s.length, min: round(s[0]), avg: round(s.reduce((x, y) => x + y, 0) / s.length), median: round(q(0.5)), p95: round(q(0.95)), max: round(s[s.length - 1]) };
}

async function newDriver() {
  const o = new edge.Options();
  o.addArguments("--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars", "--window-size=1440,1000", `--user-data-dir=${fs.mkdtempSync(path.join(TMP, "profile-"))}`);
  const prefs = new logging.Preferences();
  prefs.setLevel(logging.Type.BROWSER, logging.Level.ALL);
  o.setLoggingPrefs(prefs);
  return new Builder().forBrowser("MicrosoftEdge").setEdgeOptions(o).build();
}

const results = { startedAt: new Date().toISOString(), base: BASE, tests: [], timing: {}, environment: {} };
let driver;

const mainText = () => driver.executeScript("return (document.querySelector('main') || document.body).innerText");
const waitFor = (fn, ms = 30000, what = "condition") =>
  driver.wait(async () => {
    try {
      return await fn();
    } catch {
      return false;
    }
  }, ms, `Timed out waiting for ${what}`);
const waitText = (t, ms) => waitFor(async () => (await mainText()).includes(t), ms, `text "${t}"`);
const count = (sel) => driver.executeScript("return document.querySelectorAll(arguments[0]).length", sel);
// The app uses smooth scrolling, so scroll instantly before clicking or the target is still moving.
const clickEl = async (el) => {
  await driver.executeScript("arguments[0].scrollIntoView({ block: 'center', behavior: 'instant' })", el);
  await sleep(120);
  await el.click();
};
const clearState = async () => {
  await driver.executeScript("try { sessionStorage.clear(); localStorage.clear(); } catch (e) {}");
};
async function shot(name) {
  const png = await driver.takeScreenshot();
  fs.writeFileSync(path.join(SHOTS, `${name}.png`), png, "base64");
  return `screenshots/${name}.png`;
}
async function severeLogs() {
  try {
    const logs = await driver.manage().logs().get(logging.Type.BROWSER);
    // Only messages from the app itself: the browser's own start page and extensions are not ours.
    return logs.filter((l) => l.level.name === "SEVERE" && l.message.includes(new URL(BASE).host)).map((l) => l.message.slice(0, 200));
  } catch {
    return [];
  }
}

async function test(id, name, checks, fn, keepShot) {
  const t0 = now();
  const rec = { id, name, checks, status: "pass", ms: 0, notes: [] };
  try {
    const out = await fn(rec);
    if (out) rec.notes.push(String(out));
    if (keepShot) rec.screenshot = await shot(`${id}-${keepShot}`);
  } catch (e) {
    rec.status = "fail";
    rec.error = String(e.message ?? e).split("\n")[0].slice(0, 300);
    try {
      rec.screenshot = await shot(`${id}-FAILED`);
    } catch {}
  }
  rec.ms = Math.round(now() - t0);
  results.tests.push(rec);
  console.log(`${rec.status === "pass" ? "PASS" : "FAIL"}  ${id}  ${name}  (${rec.ms} ms)${rec.error ? "\n      " + rec.error : ""}`);
}

async function upload(files) {
  await driver.get(`${BASE}/upload`);
  await waitFor(() => count("input[type=file]").then((n) => n > 0), 20000, "the file input");
  const input = await driver.findElement(By.css("input[type=file]"));
  await input.sendKeys(files.join("\n"));
  await waitFor(async () => (await mainText()).includes("Run the detector on"), 30000, "the file check");
  const button = await driver.findElement(By.xpath("//button[contains(., 'Run the detector on')]"));
  await driver.executeScript("arguments[0].scrollIntoView({ block: 'center', behavior: 'instant' })", button);
  await sleep(150);
  const t0 = now();
  await button.click();
  await waitText("Done. The whole app now shows what you uploaded.", 180000);
  const ms = now() - t0;
  const summary = (await mainText()).split("Done. The whole app now shows what you uploaded.")[1]?.trim().split("\n")[0] ?? "";
  return { ms, summary };
}

async function analysisFor(files) {
  const fd = new FormData();
  for (const f of files) fd.append("logs", new Blob([fs.readFileSync(f)]), path.basename(f));
  const t0 = now();
  const res = await fetch(`${BASE}/api/analysis`, { method: "POST", body: fd });
  const text = await res.text();
  return { ms: now() - t0, bytes: Buffer.byteLength(text), status: res.status, json: text };
}
async function injectAnalysis(d, json) {
  await d.get(`${BASE}/upload`);
  await d.executeScript('sessionStorage.setItem("warden-analysis", arguments[0])', json);
}

const PAGES = [
  { path: "/overview", sel: "table tbody tr", min: 5, name: "Overview" },
  { path: "/alerts", sel: "table tbody tr", min: 10, name: "Alerts" },
  { path: "/keys", sel: "table tbody tr", min: 5, name: "Keys" },
  { path: "/bank-gate", sel: "table tbody tr", min: 2, name: "Bank gate" },
  { path: "/payment-run", sel: "dl.ledger", min: 1, name: "Payment run" },
  { path: "/claims", sel: "table tbody tr", min: 5, name: "Vendor claims" },
  { path: "/timeline", sel: "table tbody tr", min: 5, name: "Timeline" },
  { path: "/scorecard", sel: "table tbody tr", min: 5, name: "Scorecard" },
  { path: "/simulation", sel: "table tbody tr", min: 5, name: "Simulation" },
];

async function measurePage(d, p) {
  const t0 = now();
  await d.get(BASE + p.path);
  const loadedAt = now() - t0;
  await d.wait(async () => (await d.executeScript("return document.querySelectorAll(arguments[0]).length", p.sel)) >= p.min, 60000, `${p.name} to show data`);
  const ready = now() - t0;
  const nav = await d.executeScript(
    "const n = performance.getEntriesByType('navigation')[0]; return n ? { ttfb: n.responseStart, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd, kb: Math.round((n.transferSize || 0) / 1024) } : null;",
  );
  return { loadedAt, ready, nav };
}

async function main() {
  driver = await newDriver();
  const caps = await driver.getCapabilities();
  results.environment = {
    browser: `${caps.get("browserName")} ${caps.get("browserVersion")}`,
    driver: caps.get("msedge")?.msedgedriverVersion?.split(" ")[0] ?? "msedgedriver",
    selenium: "selenium-webdriver " + JSON.parse(fs.readFileSync(path.join(ROOT, "node_modules", "selenium-webdriver", "package.json"), "utf8")).version,
    node: process.version,
    os: `${os.type()} ${os.release()} (${os.arch()})`,
    cpu: os.cpus()[0]?.model.trim(),
    cpus: os.cpus().length,
    memoryGB: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    server: "Next.js production build (next start), same machine",
    window: "1440 x 1000, headless",
  };

  // ---- Is sign-in required on this server? Then a guest is sent to /login, and the app tests below cannot run as a guest.
  await driver.get(`${BASE}/overview`);
  const gateOn = await driver
    .wait(async () => (await driver.getCurrentUrl()).includes("/login"), 8000)
    .then(() => true)
    .catch(() => false);
  if (gateOn) {
    results.mode = "gate";
    results.note = "Sign-in is required on this server, so only the sign-in gate was tested. For the full suite start the server with NEXT_PUBLIC_REQUIRE_SIGN_IN=false and REQUIRE_SIGN_IN=false.";
    console.log("Sign-in is required here: testing the gate only.");
    await test("G1", "A guest on a page is sent to sign in", "/overview sends a signed-out visitor to /login and back-links to the page they asked for.", async () => {
      await driver.get(`${BASE}/overview`);
      await waitFor(async () => (await driver.getCurrentUrl()).includes("/login?next=%2Foverview"), 15000, "the redirect");
      await waitText("Sign in", 15000);
      if ((await count("aside")) > 0) throw new Error("the sidebar was shown to a guest");
    }, "sign-in");
    await test("G2", "Every app page is gated", "Alerts, Bank gate, Upload, Key vault and Simulation all send a guest to sign in.", async () => {
      for (const p of ["/alerts", "/bank-gate", "/upload", "/vault", "/simulation"]) {
        await driver.get(BASE + p);
        await waitFor(async () => (await driver.getCurrentUrl()).includes("/login?next="), 15000, `the redirect from ${p}`);
      }
    });
    await test("G3", "The data API refuses a guest", "GET /api/analysis answers 401 without a session.", async () => {
      const r = await fetch(`${BASE}/api/analysis`);
      if (r.status !== 401) throw new Error(`expected 401, got ${r.status}`);
    });
    await test("G4", "The landing page stays public", "/ loads without signing in and links into the app.", async () => {
      await driver.get(BASE + "/");
      await sleep(800);
      if (!(await driver.getCurrentUrl()).replace(/\/$/, "").endsWith(new URL(BASE).host)) throw new Error("the landing page redirected");
    });
    results.finishedAt = new Date().toISOString();
    results.summary = { total: results.tests.length, passed: results.tests.filter((t) => t.status === "pass").length, failed: results.tests.filter((t) => t.status === "fail").length };
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
    console.log(`\n${results.summary.passed}/${results.summary.total} passed (gate only).`);
    return;
  }

  // ---- Functional tests
  await test("T01", "The app starts empty", "No preloaded output: the overview asks for logs and the sidebar says no case is loaded.", async () => {
    await driver.get(`${BASE}/overview`);
    await clearState();
    await driver.get(`${BASE}/overview`);
    await waitText("No logs loaded yet.", 20000);
    const side = await driver.executeScript("return document.querySelector('aside')?.innerText || ''");
    if (!side.includes("No case loaded")) throw new Error("The sidebar did not say 'No case loaded'");
  }, "empty");

  await test("T02", "A renamed log is recognised by its columns", "E19 copied to bank-changes.csv is recognised and runs.", async () => {
    const renamed = path.join(TMP, "bank-changes.csv");
    fs.copyFileSync(ev("E19_vendor_master_change_log.csv"), renamed);
    await upload([renamed]);
    const text = await mainText();
    if (!text.includes("Vendor change log")) throw new Error("Not recognised as the vendor change log");
  });

  await test("T03", "The vendor change log alone holds the two suspicious bank changes", "E19 gives holds on V-0412 and V-0233 on the Bank gate.", async () => {
    await clearState();
    await upload([ev("E19_vendor_master_change_log.csv")]);
    await driver.get(`${BASE}/bank-gate`);
    await waitFor(async () => (await mainText()).includes("V-0412"), 20000, "V-0412");
    const text = await mainText();
    for (const v of ["V-0412", "V-0233"]) if (!text.includes(v)) throw new Error(`${v} not held`);
    if (!text.includes("E19 line 313") || !text.includes("E19 line 243")) throw new Error("Evidence lines missing");
  }, "bank-gate");

  await test("T04", "The BlueVault log alone finds the finance-file reads", "E05 gives a critical alert group of 38 reads.", async () => {
    await clearState();
    await upload([ev("E05_bluevault_access_log.csv")]);
    await driver.get(`${BASE}/alerts`);
    await waitFor(async () => (await mainText()).includes("Reads finance files"), 20000, "the finance-files alert");
    const text = await mainText();
    if (!/Reads finance files[\s\S]{0,200}Critical/.test(text)) throw new Error("Not rated critical");
    if (!text.includes("38")) throw new Error("38 events not shown");
  });

  let fullNoFacts = "";
  await test("T05", "All eight files without case facts", "109,061 events, 24 alert groups, 2 suppliers on hold.", async (rec) => {
    await clearState();
    const r = await upload(LOGS);
    fullNoFacts = r.summary;
    rec.notes.push(r.summary);
    if (!/109,061 events read, 24 alert groups, 2 suppliers on hold/.test(r.summary)) throw new Error(`Unexpected summary: ${r.summary}`);
    await driver.get(`${BASE}/claims`);
    await waitText("No vendor claims loaded.", 20000);
  });

  await test("T06", "All eight files with the case facts", "23 alert groups, 8 claims, scorecard 237 caught.", async (rec) => {
    await clearState();
    const r = await upload([...LOGS, PACK]);
    rec.notes.push(r.summary);
    if (!/109,061 events read, 23 alert groups, 2 suppliers on hold/.test(r.summary)) throw new Error(`Unexpected summary: ${r.summary}`);
    await driver.get(`${BASE}/claims`);
    await waitFor(() => count("table tbody tr").then((n) => n === 8), 20000, "8 claim rows");
    await driver.get(`${BASE}/scorecard`);
    await waitFor(() => count("table tbody tr").then((n) => n >= 5), 20000, "scorecard rows");
    const first = await driver.executeScript("return document.querySelector('table tbody tr').innerText");
    if (!first.includes("237")) throw new Error(`First scorecard row is ${first.replace(/\s+/g, " ")}`);
  }, "after-full-upload");

  await test("T07", "Results survive a reload", "After a reload the overview still shows the case.", async () => {
    await driver.get(`${BASE}/overview`);
    await waitText("CR-26-047", 20000);
    await driver.navigate().refresh();
    await waitText("CR-26-047", 20000);
  });

  await test("T08", "An alert opens with its reason and evidence", "Click an alert: the panel explains why and cites the evidence.", async () => {
    await driver.get(`${BASE}/alerts`);
    await waitFor(() => count("table tbody tr").then((n) => n > 10), 20000, "alert rows");
    const first = await driver.findElement(By.css("table tbody tr button"));
    await clickEl(first);
    await waitFor(() => driver.executeScript("return (document.querySelector('[role=dialog]')?.innerText || '').includes('Why it was flagged')"), 10000, "the alert panel");
    const text = await driver.executeScript("return document.querySelector('[role=dialog]').innerText");
    if (!text.includes("Evidence")) throw new Error("No evidence section");
  }, "alert-panel");

  await test("T09", "A key shows what it did and a narrower scope", "key-tb-07 advises the address block 10.20.4.0/27.", async () => {
    await driver.get(`${BASE}/keys`);
    await waitFor(() => count("ol button").then((n) => n > 0), 20000, "the rotation queue");
    const trigger = await driver.findElement(By.xpath("//ol//button[contains(., 'key-tb-07')]"));
    await clickEl(trigger);
    await waitFor(async () => (await mainText()).includes("10.20.4.0/27"), 10000, "the address block");
  }, "keys-advice");

  await test("T10", "The payment-run page uses the run days from the case facts", "A next-run date is shown.", async () => {
    await driver.get(`${BASE}/payment-run`);
    await waitText("Next payment run", 20000);
  });

  await test("T11", "A fixed address in a log is not what the detector depends on", "E02 with the attacker address replaced still raises the secret-hunt alert.", async () => {
    const altered = path.join(TMP, "E02_altered.csv");
    fs.writeFileSync(altered, fs.readFileSync(ev("E02_helpdeskr_audit_log.csv"), "utf8").replaceAll("198.18.7.41", "203.0.113.9"));
    await clearState();
    await upload([altered]);
    await driver.get(`${BASE}/alerts`);
    await waitFor(async () => (await mainText()).includes("Searches tickets for secrets"), 20000, "the secret-hunt alert");
    await (await driver.findElement(By.xpath("//table//button[contains(., 'Searches tickets for secrets')]"))).click();
    await waitFor(() => driver.executeScript("return (document.querySelector('[role=dialog]')?.innerText || '').includes('203.0.113.9')"), 10000, "the new address in the alert panel");
  });

  await test("T12", "Files that are not logs are refused", "A junk JSON, a wrong-column CSV and the staff roster are 'Not recognised'; nothing runs.", async () => {
    const junk = path.join(TMP, "junk.json");
    fs.writeFileSync(junk, '{"hello":"world"}');
    const wrong = path.join(TMP, "wrong.csv");
    fs.writeFileSync(wrong, "a,b,c\n1,2,3\n");
    await clearState();
    await driver.get(`${BASE}/upload`);
    await waitFor(() => count("input[type=file]").then((n) => n > 0), 20000, "the file input");
    await (await driver.findElement(By.css("input[type=file]"))).sendKeys([junk, wrong, ev("E14_staff_roster.csv")].join("\n"));
    await waitFor(async () => (await mainText()).split("Not recognised").length - 1 >= 3, 20000, "three refusals");
    const disabled = await driver.executeScript("return [...document.querySelectorAll('button')].some(b => b.textContent.includes('Run the detector on 0 files') && b.disabled)");
    if (!disabled) throw new Error("The run button should be disabled");
  }, "refused");

  await test("T13", "Clear and start again empties the app", "After loading logs, Clear and start again returns every page to its empty state.", async () => {
    await clearState();
    await upload([ev("E19_vendor_master_change_log.csv")]);
    await driver.get(`${BASE}/upload`);
    await waitText("Clear and start again", 20000);
    await (await driver.findElement(By.xpath("//button[contains(., 'Clear and start again')]"))).click();
    await sleep(500);
    await driver.get(`${BASE}/overview`);
    await waitText("No logs loaded yet.", 20000);
  });

  await test("T14", "Signed-out visitors see sign-in buttons and gated pages say so", "Sign in and Sign up appear; Key vault, Support tickets and Activity ask for sign-in.", async () => {
    await driver.get(`${BASE}/overview`);
    await waitFor(async () => (await mainText()).includes("Sign up"), 20000, "the Sign up button");
    for (const [p, t] of [["/vault", "Sign in to see the vault."], ["/tickets", "Sign in to use the help desk."], ["/activity", "Sign in to see saved runs"]]) {
      await driver.get(BASE + p);
      await waitText(t, 20000);
    }
    await driver.get(`${BASE}/login?mode=up`);
    await waitText("Create an account", 20000);
  }, "guest-gate");

  await test("T15", "A wrong password shows an error", "The sign-in form reports the failure from the database.", async () => {
    await driver.get(`${BASE}/login`);
    await waitFor(() => count("input[name=email]").then((n) => n > 0), 20000, "the form");
    await (await driver.findElement(By.css("input[name=email]"))).sendKeys("nobody@example.test");
    await (await driver.findElement(By.css("input[name=password]"))).sendKeys("not-a-real-password");
    await (await driver.findElement(By.css("form button[type=submit]"))).click();
    await waitFor(() => count("[role=alert]").then((n) => n > 0), 20000, "the error");
  });

  await test("T16", "The dark-mode toggle works", "The page switches to the dark theme.", async () => {
    await driver.get(`${BASE}/overview`);
    await (await driver.findElement(By.xpath("//aside//button[contains(., 'Dark mode')]"))).click();
    await waitFor(() => driver.executeScript("return document.documentElement.classList.contains('dark')"), 5000, "the dark class");
    await shot("T16-dark");
    await (await driver.findElement(By.xpath("//aside//button[contains(., 'Light mode')]"))).click();
  });

  await test("T17", "Phone width: no sideways scroll and a menu", "Key pages fit 375 px wide and show a menu button.", async (rec) => {
    await driver.sendDevToolsCommand("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
    const bad = [];
    for (const p of ["/overview", "/alerts", "/keys", "/bank-gate", "/upload", "/payment-run"]) {
      await driver.get(BASE + p);
      await sleep(400);
      const w = await driver.executeScript("return { s: document.documentElement.scrollWidth, w: window.innerWidth, menu: !!document.querySelector('button[aria-label=\"Open menu\"]') }");
      if (w.s > w.w + 1 || !w.menu) bad.push(`${p}: ${w.s}>${w.w} menu=${w.menu}`);
    }
    await shot("T17-mobile");
    await driver.sendDevToolsCommand("Emulation.clearDeviceMetricsOverride", {});
    if (bad.length) throw new Error(bad.join("; "));
  });

  await test("T18", "Every page loads without browser errors", "Sixteen pages, no severe console errors, exactly one main heading each.", async (rec) => {
    const all = ["/", "/overview", "/alerts", "/keys", "/bank-gate", "/payment-run", "/claims", "/timeline", "/scorecard", "/simulation", "/upload", "/activity", "/team", "/tickets", "/vault", "/login"];
    const bad = [];
    await severeLogs();
    for (const p of all) {
      await driver.get(BASE + p);
      await sleep(600);
      const h1 = await count("h1");
      const logs = await severeLogs();
      if (p !== "/" && h1 !== 1) bad.push(`${p}: ${h1} headings`);
      if (logs.length) bad.push(`${p}: ${logs[0]}`);
    }
    rec.notes.push(`${all.length} pages visited`);
    if (bad.length) throw new Error(bad.join(" | "));
  });

  await test("T19", "The analysis API behaves", "GET answers an empty analysis; POST with junk answers 400.", async () => {
    const g = await fetch(`${BASE}/api/analysis`);
    const j = await g.json();
    if (!g.ok || j.files?.length !== 0) throw new Error("GET should answer an empty analysis");
    const fd = new FormData();
    fd.append("logs", new Blob(['{"hello":"world"}']), "junk.json");
    const p = await fetch(`${BASE}/api/analysis`, { method: "POST", body: fd });
    if (p.status !== 400) throw new Error(`POST junk answered ${p.status}`);
  });

  // ---- Timing: server analysis (worst-case dataset: all eight files plus case facts)
  console.log("\nTiming: server analysis");
  const filesSize = [...LOGS, PACK].reduce((s, f) => s + fs.statSync(f).size, 0);
  const apiRuns = [];
  let analysisJson = "";
  for (let i = 0; i < 7; i++) {
    const r = await analysisFor([...LOGS, PACK]);
    apiRuns.push(r);
    analysisJson = r.json;
  }
  results.timing.serverAnalysis = {
    inputMB: round(filesSize / 1024 ** 2),
    responseKB: Math.round(apiRuns[0].bytes / 1024),
    runsMs: apiRuns.map((r) => round(r.ms)),
    stats: stats(apiRuns.map((r) => r.ms)),
    firstRunMs: round(apiRuns[0].ms),
  };

  // ---- Timing: scaling. The same logs repeated 2, 4 and 8 times, to find how load time grows with data
  console.log("Timing: scaling");
  const scaling = [];
  for (const factor of [1, 2, 4, 8]) {
    const fd = new FormData();
    let bytes = 0;
    let rows = 0;
    for (const f of [...LOGS, PACK]) {
      if (f.endsWith(".csv")) {
        const lines = fs.readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean);
        const body = lines.slice(1);
        const text = [lines[0], ...Array.from({ length: factor }, () => body).flat()].join("\n");
        bytes += Buffer.byteLength(text);
        rows += body.length * factor;
        fd.append("logs", new Blob([text]), path.basename(f));
      } else {
        const buf = fs.readFileSync(f);
        bytes += buf.length;
        fd.append("logs", new Blob([buf]), path.basename(f));
      }
    }
    const t0 = now();
    let status = 0;
    let respKB = 0;
    let error = "";
    try {
      const res = await fetch(`${BASE}/api/analysis`, { method: "POST", body: fd });
      status = res.status;
      respKB = Math.round(Buffer.byteLength(await res.text()) / 1024);
    } catch (e) {
      error = String(e.message ?? e).slice(0, 120);
    }
    scaling.push({ factor, rows, inputMB: round(bytes / 1024 ** 2), ms: round(now() - t0), status, responseKB: respKB, error });
  }
  results.timing.scaling = scaling;

  // ---- Timing: whole upload in the browser (click Run -> results on screen)
  console.log("Timing: upload through the browser");
  const uiRuns = [];
  for (let i = 0; i < 4; i++) {
    await clearState();
    const r = await upload([...LOGS, PACK]);
    uiRuns.push(r.ms);
  }
  results.timing.browserUpload = { runsMs: uiRuns.map(round), stats: stats(uiRuns) };

  // ---- Timing: page ready, first visit in a fresh browser and repeat visits (full dataset in the page)
  console.log("Timing: page load, first visit");
  const cold = {};
  for (const p of PAGES) {
    const d = await newDriver();
    try {
      await injectAnalysis(d, analysisJson);
      cold[p.path] = await measurePage(d, p);
    } finally {
      await d.quit();
    }
  }
  console.log("Timing: page load, repeat visits");
  await injectAnalysis(driver, analysisJson);
  const warm = {};
  for (const p of PAGES) {
    const runs = [];
    for (let i = 0; i < 6; i++) runs.push(await measurePage(driver, p));
    warm[p.path] = runs;
  }
  results.timing.pages = PAGES.map((p) => {
    const w = warm[p.path];
    return {
      name: p.name,
      path: p.path,
      first: { loadMs: round(cold[p.path].loadedAt), readyMs: round(cold[p.path].ready), ttfbMs: round(cold[p.path].nav?.ttfb ?? 0), transferKB: cold[p.path].nav?.kb ?? 0 },
      repeat: { load: stats(w.map((r) => r.loadedAt)), ready: stats(w.map((r) => r.ready)) },
    };
  });
  const everyReady = results.timing.pages.flatMap((p) => [p.first.readyMs, p.repeat.ready.max]);
  const worstPage = results.timing.pages.reduce((a, p) => (Math.max(p.first.readyMs, p.repeat.ready.max) > Math.max(a.first.readyMs, a.repeat.ready.max) ? p : a));
  results.timing.worst = {
    page: worstPage.name,
    pageReadyMs: Math.max(worstPage.first.readyMs, worstPage.repeat.ready.max),
    allPagesMaxMs: Math.max(...everyReady),
    serverAnalysisMaxMs: results.timing.serverAnalysis.stats.max,
    browserUploadMaxMs: results.timing.browserUpload.stats.max,
  };

  // ---- Screenshots of the loaded app
  await injectAnalysis(driver, analysisJson);
  for (const p of [...PAGES, { path: "/upload", name: "Upload" }]) {
    await driver.get(BASE + p.path);
    await sleep(900);
    await shot(`page-${p.path.slice(1)}`);
  }

  results.finishedAt = new Date().toISOString();
  results.summary = { total: results.tests.length, passed: results.tests.filter((t) => t.status === "pass").length, failed: results.tests.filter((t) => t.status === "fail").length };
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  console.log(`\n${results.summary.passed}/${results.summary.total} passed. Worst page ready: ${results.timing.worst.page} ${results.timing.worst.pageReadyMs} ms; worst browser upload ${results.timing.worst.browserUploadMaxMs} ms.`);
}

main()
  .catch((e) => {
    console.error("The run failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await driver?.quit();
    } catch {}
    fs.rmSync(TMP, { recursive: true, force: true });
  });
