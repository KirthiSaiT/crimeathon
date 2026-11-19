import type { ScoreRow } from "../lib/types";
import { buildBaseline } from "./baseline";
import { detect } from "./detect";
import type { Context, Evt, Options, Parsed } from "./types";

const HOUR = 3_600_000;
const POPULATION = new Set(["LedgerOne", "HelpDeskr", "BlueVault", "Network link"]);

// Ground truth is our own attribution: events from the attacker's addresses, plus reads of finance folders
// by the storage key where the address is blank (the key's only other source is its portal server).
// It exists to measure the rules, not to prove them.
export function labelAttackers(events: Evt[], ctx: Context): Set<string> {
  const out = new Set<string>();
  for (const e of events) {
    if (e.actorKind !== "integration" || !POPULATION.has(e.system)) continue;
    if (e.system === "Network link" && /sandbox/i.test(e.object)) continue; // announced maintenance, not the attack
    const bySource = ctx.attackerSources.some((p) => (p.endsWith(".") ? e.source.startsWith(p) : e.source === p));
    const blankFinance = e.system === "BlueVault" && e.source === "" && /\/(finance|hr)\b/.test(e.sig);
    if (bySource || blankFinance) out.add(e.id);
  }
  return out;
}

function score(events: Evt[], truth: Set<string>, ctx: Context, opt: Options) {
  const baseline = buildBaseline(events, opt);
  const findings = detect(events, baseline, ctx);
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const e of events) {
    if (e.actorKind !== "integration" || !POPULATION.has(e.system)) continue;
    const f = findings.get(e.id);
    const flagged = Boolean(f && !f.ordinary);
    const bad = truth.has(e.id);
    if (flagged && bad) tp++;
    else if (flagged) fp++;
    else if (bad) fn++;
    else tn++;
  }
  return { tp, fp, fn, tn };
}

const bump = (ip: string) => ip.replace(/^10\.20\.4\.(\d+)$/, (_, n: string) => `10.20.4.${+n + 90}`);

// Run the same rules on altered copies of the logs, the way an unseen variation would.
export function buildScorecard(parsed: Parsed, ctx: Context, opt: Options): ScoreRow[] {
  const events = parsed.events;
  const truth = labelAttackers(events, ctx);
  const row = (name: string, detail: string, evs: Evt[], o: Options): ScoreRow => ({ name, detail, ...score(evs, truth, ctx, o) });

  return [
    row("Supplied logs", "Baseline frozen at the cutoff", events, opt),
    row("Renumbered computers", "Every vendor-link address moved by 90", events.map((e) => ({ ...e, source: bump(e.source) })), opt),
    row("Two clocks shifted two hours", "HelpDeskr and BlueVault timestamps moved by +2 h", events.map((e) => (e.system === "HelpDeskr" || e.system === "BlueVault" ? { ...e, ts: e.ts + 2 * HOUR } : e)), opt),
    row("Attacker on a real sync computer", "The build host's traffic now comes from 10.20.4.13", events.map((e) => (e.source === "10.20.4.77" ? { ...e, source: "10.20.4.13" } : e)), opt),
    row("Same, baseline learned from all data", "The attacker's own traffic becomes normal", events.map((e) => (e.source === "10.20.4.77" ? { ...e, source: "10.20.4.13" } : e)), { ...opt, baselineFraction: 1 }),
  ];
}
