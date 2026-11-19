// Builds the Selenium test report (HTML) from docs/selenium/results.json.
//   node tests/e2e/report.mjs
import fs from "node:fs";
import path from "node:path";

const OUT = process.env.E2E_OUT ? path.resolve(process.env.E2E_OUT) : path.join(process.cwd(), "docs", "selenium");
const r = JSON.parse(fs.readFileSync(path.join(OUT, "results.json"), "utf8"));
if (r.mode === "gate") {
  console.log("That run tested the sign-in gate only, so there is no report to build.");
  process.exit(0);
}
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ms = (n) => (n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${Math.round(n)} ms`);
const t = r.timing;
const date = new Date(r.finishedAt).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }) + " UTC";
const shot = (f, cap) => (fs.existsSync(path.join(OUT, f)) ? `<figure><img src="${f}" alt="${esc(cap)}"><figcaption>${esc(cap)}</figcaption></figure>` : "");

const tests = r.tests
  .map(
    (x) => `<tr><td class="mono">${x.id}</td><td><b>${esc(x.name)}</b><br><span class="muted">${esc(x.checks)}</span>${x.notes?.length ? `<br><span class="mono small">${esc(x.notes.join(" | "))}</span>` : ""}${x.error ? `<br><span class="bad">${esc(x.error)}</span>` : ""}</td><td class="${x.status === "pass" ? "ok" : "bad"}">${x.status === "pass" ? "PASS" : "FAIL"}</td><td class="num">${ms(x.ms)}</td></tr>`,
  )
  .join("");

const pageRows = t.pages
  .map(
    (p) =>
      `<tr><td>${esc(p.name)}</td><td class="num">${ms(p.first.loadMs)}</td><td class="num">${ms(p.first.readyMs)}</td><td class="num">${ms(p.repeat.ready.min)}</td><td class="num">${ms(p.repeat.ready.avg)}</td><td class="num">${ms(p.repeat.ready.p95)}</td><td class="num"><b>${ms(p.repeat.ready.max)}</b></td></tr>`,
  )
  .join("");

const scalingRows = t.scaling
  .map((s) => `<tr><td class="num">${s.factor} x</td><td class="num">${s.rows.toLocaleString("en-GB")}</td><td class="num">${s.inputMB} MB</td><td class="num"><b>${ms(s.ms)}</b></td><td class="${s.status === 200 ? "ok" : "bad"}">HTTP ${s.status}${s.error ? " " + esc(s.error) : ""}</td></tr>`)
  .join("");

const slowestFirst = t.pages.reduce((a, p) => (p.first.readyMs > a.first.readyMs ? p : a));
const slowestRepeat = t.pages.reduce((a, p) => (p.repeat.ready.max > a.repeat.ready.max ? p : a));
const last = t.scaling[t.scaling.length - 1];

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Warden: Selenium test report</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font: 11px/1.5 "Segoe UI", Arial, sans-serif; color: #1a1a1a; margin: 0; }
  h1 { font-size: 22px; margin: 0 0 2px; } h2 { font-size: 15px; margin: 22px 0 6px; border-bottom: 2px solid #1a1a1a; padding-bottom: 3px; } h3 { font-size: 12px; margin: 14px 0 4px; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0; } th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #cfcfcf; vertical-align: top; }
  th { background: #f0eee9; font-weight: 600; } .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; } .mono { font-family: Consolas, monospace; } .small { font-size: 10px; }
  .muted { color: #555; } .ok { color: #11663a; font-weight: 700; } .bad { color: #b3261e; font-weight: 700; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0; } .card { border: 1px solid #1a1a1a; padding: 8px 10px; } .card b { display: block; font-size: 20px; } .card span { color: #555; }
  figure { margin: 8px 0; break-inside: avoid; } figure img { width: 100%; border: 1px solid #cfcfcf; } figcaption { color: #555; font-size: 10px; } .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .box { border-left: 3px solid #b3261e; background: #fbeeed; padding: 6px 10px; margin: 8px 0; } .note { border-left: 3px solid #1a1a1a; background: #f6f4ef; padding: 6px 10px; margin: 8px 0; }
  ul { margin: 4px 0 4px 18px; padding: 0; }
</style></head><body>
<h1>Warden: Selenium test report</h1>
<div class="muted">Team H4CK_077, CRIMEATHON'26 case CR-26-047, Defense. Run on ${esc(date)}.</div>

<div class="cards">
  <div class="card"><b>${r.summary.passed} / ${r.summary.total}</b><span>automated tests passed</span></div>
  <div class="card"><b>${ms(t.worst.pageReadyMs)}</b><span>worst page load, full data on screen</span></div>
  <div class="card"><b>${ms(t.browserUpload.stats.max)}</b><span>worst upload through the browser (10.7 MB, 109,428 rows)</span></div>
  <div class="card"><b>${ms(last.ms)}</b><span>worst stress case (${last.inputMB} MB, ${last.rows.toLocaleString("en-GB")} rows), HTTP ${last.status}</span></div>
</div>

<h2>1. What was tested and how</h2>
<p>Selenium WebDriver (${esc(r.environment.selenium)}) drove a real Microsoft Edge browser through the app the way a person would: choosing files in the upload dialog, clicking buttons, reading what appears on screen, resizing to a phone, and reloading. The tests run against a <b>production build</b> of the app (Next.js <span class="mono">next start</span>), not the development server, because the development server is slower and would overstate load times.</p>
<table>
  <tr><th>Environment</th><th></th></tr>
  <tr><td>Browser</td><td>${esc(r.environment.browser)}, ${esc(r.environment.window)}</td></tr>
  <tr><td>Driver / tool</td><td>${esc(r.environment.driver)}, ${esc(r.environment.selenium)}, Node ${esc(r.environment.node)}</td></tr>
  <tr><td>Machine</td><td>${esc(r.environment.cpu)}, ${r.environment.cpus} logical CPUs, ${r.environment.memoryGB} GB memory, ${esc(r.environment.os)}</td></tr>
  <tr><td>Server</td><td>${esc(r.environment.server)} (so there is no network delay in these numbers)</td></tr>
  <tr><td>Data</td><td>The supplied evidence: 7 logs and the key register, 10.7 MB, 109,428 rows, plus the case-facts file</td></tr>
</table>

<h2>2. Functional results</h2>
<table><tr><th>ID</th><th>Test and what it checks</th><th>Result</th><th>Time</th></tr>${tests}</table>

<h2>3. Load times</h2>
<p>All page timings are with the <b>full dataset loaded</b> (all 8 files and the case facts, 23 alert groups, 40 bank changes, 32 timeline rows). "Page ready" is measured from the moment the browser is told to open the page until the table data is visible, so it includes loading the page, running its code and drawing the data.</p>
<h3>3.1 Pages (milliseconds)</h3>
<table><tr><th>Page</th><th class="num">First visit: page loaded</th><th class="num">First visit: data visible</th><th class="num">Repeat: fastest</th><th class="num">Repeat: average</th><th class="num">Repeat: 95th percentile</th><th class="num">Repeat: slowest</th></tr>${pageRows}</table>
<div class="muted">First visit: a fresh browser each time. Repeat: 6 visits in one browser.</div>

<h3>3.2 Running the detector (the heaviest operation)</h3>
<table>
  <tr><th>Measure</th><th class="num">Fastest</th><th class="num">Average</th><th class="num">95th percentile</th><th class="num">Slowest</th><th>Runs</th></tr>
  <tr><td>Server analysis of all 8 files and the case facts (${t.serverAnalysis.inputMB} MB in, ${t.serverAnalysis.responseKB} KB out)</td><td class="num">${ms(t.serverAnalysis.stats.min)}</td><td class="num">${ms(t.serverAnalysis.stats.avg)}</td><td class="num">${ms(t.serverAnalysis.stats.p95)}</td><td class="num"><b>${ms(t.serverAnalysis.stats.max)}</b></td><td>${t.serverAnalysis.stats.n}</td></tr>
  <tr><td>Whole upload in the browser: click "Run" until the results are on screen</td><td class="num">${ms(t.browserUpload.stats.min)}</td><td class="num">${ms(t.browserUpload.stats.avg)}</td><td class="num">${ms(t.browserUpload.stats.p95)}</td><td class="num"><b>${ms(t.browserUpload.stats.max)}</b></td><td>${t.browserUpload.stats.n}</td></tr>
</table>

<h3>3.3 Stress test: how load time grows with data</h3>
<p>The same logs repeated 1, 2, 4 and 8 times, to find the worst case and where it breaks.</p>
<table><tr><th class="num">Size</th><th class="num">Log rows</th><th class="num">Upload</th><th class="num">Analysis time</th><th>Result</th></tr>${scalingRows}</table>
<p>Time grows roughly in step with the data. The largest case, <b>${last.inputMB} MB and ${last.rows.toLocaleString("en-GB")} rows (about ${Math.round(last.rows / 109428)} times the supplied evidence), finished in ${ms(last.ms)}</b>.</p>

<h2>4. Worst load times</h2>
<table>
  <tr><th>Case</th><th class="num">Worst time</th><th>Detail</th></tr>
  <tr><td>Slowest page, first visit</td><td class="num"><b>${ms(slowestFirst.first.readyMs)}</b></td><td>${esc(slowestFirst.name)}, fresh browser, data visible</td></tr>
  <tr><td>Slowest page, repeat visits</td><td class="num"><b>${ms(slowestRepeat.repeat.ready.max)}</b></td><td>${esc(slowestRepeat.name)}, slowest of 6</td></tr>
  <tr><td>Slowest across every page and run</td><td class="num"><b>${ms(t.worst.allPagesMaxMs)}</b></td><td>${esc(t.worst.page)}. In repeated complete runs of this suite the slowest page varied between roughly 200 ms and 300 ms, so expect a run-to-run spread of about 100 ms.</td></tr>
  <tr><td>Running the detector on the supplied evidence</td><td class="num"><b>${ms(t.browserUpload.stats.max)}</b></td><td>From clicking Run until the results are on screen</td></tr>
  <tr><td>Stress case (${last.inputMB} MB, ${last.rows.toLocaleString("en-GB")} rows)</td><td class="num"><b>${ms(last.ms)}</b></td><td>Server analysis only</td></tr>
</table>

<h2>5. A real defect the stress test found, and its fix</h2>
<div class="box"><b>Defect.</b> Uploading more than roughly 120,000 log rows in total made the server answer <b>HTTP 500 "Maximum call stack size exceeded"</b>. The supplied evidence (109,428 rows) was just under the limit, which is why every earlier check passed. The cause was code that found the earliest and latest event with <span class="mono">Math.min(...list)</span> and <span class="mono">Math.max(...list)</span>, which pass every element as an argument.</div>
<div class="note"><b>Fix.</b> Those calls were replaced with a plain loop (<span class="mono">src/engine/num.ts</span>). A regression test now analyses more than 300,000 events and must not fail. After the fix the 2 x, 4 x and 8 x cases all return HTTP 200 (section 3.3). The unit tests went from 38 to 39, all passing.</div>
<p>Two other issues found while writing the tests were in the tests, not the app: the app uses smooth scrolling, so a test must scroll instantly before it clicks, and the browser's own start page writes a harmless message to the log, which the tests now ignore.</p>

<h2>6. Screenshots from the run</h2>
<div class="two">
${shot("screenshots/T01-empty.png", "T01: the app starts empty")}
${shot("screenshots/T03-bank-gate.png", "T03: one log (E19) holds the two suspicious bank changes")}
${shot("screenshots/T06-after-full-upload.png", "T06: all files and the case facts, the scorecard")}
${shot("screenshots/T08-alert-panel.png", "T08: an alert with its reason and evidence")}
${shot("screenshots/T09-keys-advice.png", "T09: a key with its narrower scope and address block")}
${shot("screenshots/T12-refused.png", "T12: files that are not logs are refused")}
${shot("screenshots/T14-guest-gate.png", "T14: a signed-out visitor is asked to sign in")}
${shot("screenshots/T17-mobile.png", "T17: phone width")}
${shot("screenshots/page-alerts.png", "Alerts with the full data")}
${shot("screenshots/page-simulation.png", "Simulation with the full data")}
</div>

<h2>7. Limits of these results</h2>
<ul>
  <li>The server and the browser ran on the <b>same laptop</b>, so there is no network delay. On a real network the page times would be higher by the round-trip time, and an upload by the time to send the files.</li>
  <li>The browser was <b>headless</b> Edge. A visible browser behaves the same but can be slightly slower to draw.</li>
  <li>Timings are on a laptop with ${r.environment.memoryGB} GB of memory. A larger server would be faster.</li>
  <li>The signed-in pages (Key vault, Support tickets, Access) need an account and a live database; they are covered by the database tests and manual checks, not by this browser run. This run covers the signed-out experience and the sign-in form.</li>
  <li>The numbers come from one machine and a handful of runs per page. They show the order of magnitude and the shape of the growth, not a guarantee for every setup.</li>
</ul>

<h2>8. How to run it again</h2>
<ul>
  <li>Build and start the production server: <span class="mono">npm run build</span>, then <span class="mono">npx next start -p 3100</span></li>
  <li>Run the tests and timings: <span class="mono">node tests/e2e/run.mjs</span> (results in <span class="mono">docs/selenium/results.json</span>)</li>
  <li>Rebuild this report: <span class="mono">node tests/e2e/report.mjs</span></li>
</ul>
</body></html>`;

fs.writeFileSync(path.join(OUT, "report.html"), html);
console.log("wrote docs/selenium/report.html");
