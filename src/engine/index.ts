import type { Alert, TimelineEvent } from "../lib/types";
import { buildBaseline } from "./baseline";
import { checkBank } from "./bank";
import { verifyClaims } from "./claims";
import { emptyContext, parseFacts } from "./facts";
import { detect } from "./detect";
import { buildScorecard, labelAttackers } from "./evaluate";
import { simulate } from "./simulate";
import { groupFindings } from "./groups";
import { assessKeys } from "./keys";
import { sortEvents } from "./loaders";
import type { Analysis, Context, Options, Parsed } from "./types";
import { defaultOptions } from "./types";

// No case facts by default: the detector knows only what the logs say, until facts are supplied.
export const defaultContext: Context = emptyContext;
export { emptyContext, parseFacts };
export { addFile, emptyParsed, detectKind } from "./loaders";
export { defaultOptions } from "./types";
export type { Analysis, Parsed, Options, Context } from "./types";

const iso = (ts: number) => new Date(ts).toISOString().replace(".000Z", "Z");

function phase(a: Alert): TimelineEvent["kind"] {
  // Items that need a human look are not part of the attack path: they stay in the full timeline as context.
  if (a.status === "review") return "context";
  return /bank account|bank details/i.test(a.title) ? "attack" : "theft";
}

// Accuracy and the simulation are measured only when there are attacker labels to measure against.
export function analyze(input: Parsed, given: Context = defaultContext, options: Partial<Options> = {}, measure?: boolean): Analysis {
  const ctx = input.context ?? given;
  const measureAccuracy = measure ?? ctx.attackerSources.length > 0;
  const opt: Options = { ...defaultOptions, ...options };
  const parsed = sortEvents({ ...input, events: [...input.events], changes: [...input.changes] });

  const baseline = buildBaseline(parsed.events, opt);
  const findings = detect(parsed.events, baseline, ctx);
  const grouped = groupFindings(parsed.events, findings, baseline, opt);
  const bankResult = checkBank(parsed.changes);

  // One list of alert groups: log findings first, then the bank gate's, numbered by time within each status.
  const all = [...grouped.alerts, ...bankResult.alerts].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  let nf = 0;
  let no = 0;
  const alerts = all.map((a) => ({ ...a, id: a.status === "ordinary" ? `O-${String(++no).padStart(2, "0")}` : `A-${String(++nf).padStart(2, "0")}` }));

  const flaggedActors = new Set(parsed.events.filter((e) => findings.get(e.id) && !findings.get(e.id)!.ordinary && e.actorKind === "integration" && e.system !== "Network link").map((e) => e.actor));
  const keys = parsed.register ? assessKeys(parsed.register, flaggedActors, baseline.summary) : [];
  const claims = verifyClaims(ctx.claims, parsed.events, findings);

  const live: TimelineEvent[] = alerts
    .filter((a) => a.status !== "ordinary")
    .map((a) => ({ id: "", when: a.start, title: `${a.title} (${a.key}, ${a.count} event${a.count === 1 ? "" : "s"})`, system: a.system, kind: phase(a), evidence: a.evidence }));
  const timeline = [...ctx.events.map((e) => ({ ...e, id: "" })), ...live]
    .sort((a, b) => Date.parse(a.when) - Date.parse(b.when))
    .map((e, i) => ({ ...e, id: `T-${String(i + 1).padStart(2, "0")}` }));

  const flagged = [...findings.values()].filter((f) => !f.ordinary).length;
  const stamps = [...parsed.events.map((e) => e.ts), ...parsed.changes.map((c) => c.ts)];
  return {
    alerts,
    timeline,
    keys,
    bank: bankResult.bank,
    claims,
    scorecard: measureAccuracy ? buildScorecard(parsed, ctx, opt) : [],
    baseline: baseline.summary,
    simulation: measureAccuracy ? simulate(parsed.events, findings, baseline, labelAttackers(parsed.events, ctx), bankResult.bank, ctx) : null,
    files: parsed.files,
    caseInfo: ctx.case ?? null,
    paymentRunDays: ctx.paymentRunDays ?? [],
    stats: {
      events: parsed.events.length,
      flagged,
      ordinary: findings.size - flagged,
      cutoff: iso(baseline.cutoff),
      labelled: measureAccuracy,
      from: stamps.length ? iso(Math.min(...stamps)) : null,
      to: stamps.length ? iso(Math.max(...stamps)) : null,
      registerExported: parsed.register?.exported ?? null,
      source: parsed.files.length === 0 ? "empty" : "upload",
    },
  };
}
