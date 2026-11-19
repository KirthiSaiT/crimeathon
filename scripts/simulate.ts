// Replay the attack through the defense: npm run simulate [evidence folder]
// Everything comes from the engine's own simulation, so the app and this script always agree.
import { readFileSync } from "node:fs";
import { analyze, parseFacts } from "../src/engine";
import { loadEvidenceDir } from "../src/engine/node";

const caseAt = process.argv.indexOf("--case");
const facts = caseAt > 0 ? parseFacts(JSON.parse(readFileSync(process.argv[caseAt + 1], "utf8"))) : null;
const dir = process.argv.find((a, i) => i > 1 && !a.startsWith("--") && process.argv[i - 1] !== "--case") ?? "evidence";
const s = analyze(loadEvidenceDir(dir), facts ?? undefined).simulation;
if (!s) throw new Error("No simulation for this input: it needs case facts with attacker address ranges (--case).");

console.log(`Attacker events: ${s.attackerEvents}\n\nWhen the defense would have fired:`);
for (const m of s.milestones) console.log(`  ${m.when.slice(0, 16)}  ${m.daysBeforeChange.toFixed(1).padStart(5)} days before the change  ${m.label}  (${m.detail})`);

console.log("\nPer key (suspend the key at its first alert, or one day later):");
for (const k of s.perKey) console.log(`  ${k.actor.padEnd(12)} first alert ${k.firstAlert.slice(0, 16)}  last misuse ${k.lastMisuse.slice(0, 10)}  events ${String(k.events).padStart(3)}  refused now ${String(k.refusedAtFirstAlert).padStart(3)}  refused after 1 day ${String(k.refusedAfterOneDay).padStart(3)}`);

console.log("\nHow fast must the response be? (alert, then revoke the key)");
for (const r of s.sensitivity) console.log(`  ${r.delay.padEnd(20)} prevents ${String(r.prevented).padStart(3)} (${String(r.share).padStart(5)}%)  stops the bank change: ${r.stopsBankChange ? "yes" : "no"}`);

console.log("\nSingle controls, one at a time:");
for (const c of s.controls) console.log(`  ${c.name.padEnd(52)} blocks ${String(c.blocked).padStart(3)} (${String(c.share).padStart(5)}%)  stops the bank change: ${c.stopsBankChange}`);

console.log("\nAssumptions:");
for (const a of s.assumptions) console.log(`  - ${a}`);
