// Command-line run: npm run analyze [evidence folder] [--json]
import { readFileSync } from "node:fs";
import { analyze, parseFacts } from "../src/engine";
import { loadEvidenceDir } from "../src/engine/node";

// npm run analyze -- <folder> [--case facts.json] [--json]. Without --case the detector knows only what the logs say.
const caseAt = process.argv.indexOf("--case");
const facts = caseAt > 0 ? parseFacts(JSON.parse(readFileSync(process.argv[caseAt + 1], "utf8"))) : null;
const dir = process.argv.find((a, i) => i > 1 && !a.startsWith("--") && process.argv[i - 1] !== "--case") ?? "evidence";
const t0 = Date.now();
const parsed = loadEvidenceDir(dir);
const result = analyze(parsed, facts ?? undefined);
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(result, null, 1));
} else {
  console.log(`Read ${parsed.files.length} files, ${result.stats.events.toLocaleString()} events in ${Date.now() - t0} ms. Baseline cutoff ${result.stats.cutoff}.`);
  console.log(`Flagged events ${result.stats.flagged}, ordinary ${result.stats.ordinary}.\n`);
  for (const a of result.alerts) console.log(`${a.id} [${a.severity}/${a.status}] ${a.title} | ${a.key} | ${a.source} | ${a.start.slice(0, 16)} | ${a.count} | ${a.evidence.map((e) => `${e.file} ${e.lines}`).join(", ")}`);
  console.log("\nBank holds:", result.bank.filter((b) => b.hold).map((b) => `${b.vendorId} ${b.status} ${b.evidence}`).join(" | "));
  console.log("\nClaims:");
  for (const c of result.claims) console.log(`  ${c.id} ${c.verdict}: ${c.because.slice(0, 150)}`);
  console.log("\nScorecard:");
  for (const s of result.scorecard) console.log(`  ${s.name.padEnd(40)} TP ${s.tp} FP ${s.fp} FN ${s.fn} TN ${s.tn}`);
}
