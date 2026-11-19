import type { Alert, EvidenceRef, Severity } from "../lib/types";
import type { Baseline, Evt, Finding, Options } from "./types";

const HOUR = 3_600_000;
const sevRank: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export function refsOf(events: { file: string; line: number }[]): EvidenceRef[] {
  const byFile = new Map<string, number[]>();
  for (const e of events) byFile.set(e.file, [...(byFile.get(e.file) ?? []), e.line]);
  return [...byFile].sort().map(([file, lines]) => {
    const sorted = [...new Set(lines)].sort((a, b) => a - b);
    if (sorted.length <= 4) return { file, lines: sorted.join(", ") };
    return { file, lines: `${sorted[0]}-${sorted[sorted.length - 1]}` };
  });
}

const iso = (ts: number) => new Date(ts).toISOString().replace(".000Z", "Z");
const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;

// Many events become a short list of alert groups: same system, actor and kind of action,
// split wherever the activity pauses for longer than the gap.
export function groupFindings(events: Evt[], findings: Map<string, Finding>, baseline: Baseline, opt: Options): { alerts: Alert[]; byEvent: Map<string, string> } {
  const buckets = new Map<string, { e: Evt; f: Finding }[]>();
  for (const e of events) {
    const f = findings.get(e.id);
    if (!f) continue;
    const key = `${f.ordinary ? "o" : "f"}|${e.system}|${e.actor}|${f.label}`;
    buckets.set(key, [...(buckets.get(key) ?? []), { e, f }]);
  }

  const raw: { items: { e: Evt; f: Finding }[]; ordinary: boolean }[] = [];
  for (const items of buckets.values()) {
    const ordinary = items[0].f.ordinary;
    const gap = (ordinary ? 60 * 24 : opt.gapHours) * HOUR;
    let cur: { e: Evt; f: Finding }[] = [];
    for (const it of items) {
      if (cur.length && it.e.ts - cur[cur.length - 1].e.ts > gap) {
        raw.push({ items: cur, ordinary });
        cur = [];
      }
      cur.push(it);
    }
    if (cur.length) raw.push({ items: cur, ordinary });
  }
  raw.sort((a, b) => a.items[0].e.ts - b.items[0].e.ts);

  let nf = 0;
  let no = 0;
  const alerts: Alert[] = [];
  const byEvent = new Map<string, string>();
  for (const g of raw) {
    const first = g.items[0];
    const sources = [...new Set(g.items.map((i) => i.e.source).filter(Boolean))].sort();
    const sev = g.items.reduce<Severity>((m, i) => (sevRank[i.f.severity] > sevRank[m] ? i.f.severity : m), "low");
    const id = g.ordinary ? `O-${String(++no).padStart(2, "0")}` : `A-${String(++nf).padStart(2, "0")}`;
    const status: Alert["status"] = g.ordinary ? "ordinary" : first.f.rule === "failed-logins" ? "review" : "open";

    let rule = g.ordinary ? first.f.why : `${first.f.why}`;
    if (first.f.rule === "secret-search") rule += ` Terms searched: ${[...new Set(g.items.map((i) => i.e.detail).filter(Boolean))].slice(0, 9).join(", ")}.`;
    if (first.f.label === "Reads finance files") {
      const reads = g.items.filter((i) => /^read/.test(i.e.sig));
      rule += ` ${reads.length} reads of ${new Set(reads.map((i) => i.e.object)).size} files, ${mb(reads.reduce((s, i) => s + i.e.records, 0))}, on a key that had never read a finance folder.`;
    }
    if (g.items.length > 1 && first.f.rule !== "secret-search") rule = `${g.items.length} events. ${rule}`;

    const b = baseline.summary.find((s) => s.actor === first.e.actor);
    const normal = g.ordinary
      ? "Matches ordinary activity for this actor."
      : b
        ? `Normally used from ${b.hosts.length} computer${b.hosts.length === 1 ? "" : "s"} (${b.hosts.slice(0, 3).join(", ")}${b.hosts.length > 3 ? ", …" : ""}) for ${b.actions.length} kind${b.actions.length === 1 ? "" : "s"} of action.`
        : "No baseline for this actor.";

    g.items.forEach((i) => byEvent.set(i.e.id, id));
    alerts.push({
      id,
      title: first.f.label,
      system: first.e.system,
      key: first.e.actor,
      source: sources.length > 3 ? `${sources.slice(0, 3).join(", ")} and ${sources.length - 3} more` : sources.join(", ") || "blank address",
      start: iso(first.e.ts),
      end: iso(g.items[g.items.length - 1].e.ts),
      count: g.items.length,
      severity: sev,
      status,
      rule,
      normal,
      evidence: refsOf(g.items.map((i) => i.e)),
    });
  }
  return { alerts, byEvent };
}
