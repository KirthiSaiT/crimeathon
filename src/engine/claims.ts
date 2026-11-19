import type { Claim, EvidenceRef, Verdict } from "../lib/types";
import type { ClaimDef, Evt, Finding } from "./types";
import { refsOf } from "./groups";

const date = (ts: number) => new Date(ts).toISOString().slice(0, 10);
const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).replace("Sept", "Sep");
const range = (days: string[]) => (days[0] === days[days.length - 1] ? shortDate(days[0]) : `${shortDate(days[0])} to ${shortDate(days[days.length - 1])}`);

// Each statement in a vendor notice becomes a test over the company's own logs.
export function verifyClaims(defs: ClaimDef[], events: Evt[], findings: Map<string, Finding>): Claim[] {
  const flagged = events.filter((e) => {
    const f = findings.get(e.id);
    return f && !f.ordinary && e.system !== "SSO";
  });

  return defs.map((d): Claim => {
    const c = d.check as Record<string, unknown>;
    let verdict: Verdict = "unproven";
    let because = "The logs do not settle this either way.";
    let evidence: EvidenceRef[] = [];

    switch (c.type) {
      case "only-dates": {
        const from = String(c.from);
        const to = String(c.to);
        const outside = flagged.filter((e) => date(e.ts) < from || date(e.ts) > to);
        if (outside.length > 0) {
          verdict = "false";
          const byActor = new Map<string, string[]>();
          outside.forEach((e) => byActor.set(e.actor, [...(byActor.get(e.actor) ?? []), date(e.ts)]));
          const parts = [...byActor].map(([a, ds]) => `${a} on ${range([...new Set(ds)].sort())}`);
          because = `Flagged activity falls outside ${shortDate(from)} to ${shortDate(to)}: ${parts.join("; ")}.`;
          evidence = refsOf(outside);
        } else {
          verdict = "unproven";
          because = "All flagged activity falls inside the stated dates. That does not prove nothing else happened.";
        }
        break;
      }
      case "no-system-access": {
        const systems = (c.systems as string[]) ?? [];
        const hit = flagged.filter((e) => systems.includes(e.system));
        if (hit.length > 0) {
          verdict = "false";
          const counts = new Map<string, number>();
          hit.forEach((e) => counts.set(findings.get(e.id)!.label, (counts.get(findings.get(e.id)!.label) ?? 0) + 1));
          because = `${hit.length} flagged events in ${systems.join(" and ")}: ${[...counts].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([l, n]) => `${l.toLowerCase()} (${n})`).join(", ")}.`;
          evidence = refsOf(hit);
        }
        break;
      }
      case "exports-removed": {
        const downloaded = new Set<string>();
        const deleted = new Set<string>();
        for (const e of events.filter((x) => x.system === "LedgerOne" && x.actorKind === "integration")) {
          const id = /\/exports\/(\d+)/.exec(e.object)?.[1];
          if (!id) continue;
          if (/download$/.test(e.object)) downloaded.add(id);
          if (e.sig.startsWith("DELETE")) deleted.add(id);
        }
        const kept = [...downloaded].filter((id) => !deleted.has(id));
        const failed = events.filter((e) => e.system === "HelpDeskr" && e.actorKind === "integration" && e.action === "export.delete" && e.status === "error");
        const bits: string[] = [];
        if (failed.length) bits.push(`the delete of ${failed.map((f) => f.object).join(", ")} failed (${failed[0].detail || "error"})`);
        if (kept.length) bits.push(`finance export${kept.length > 1 ? "s" : ""} ${kept.join(", ")} ${kept.length > 1 ? "have" : "has"} no delete row`);
        if (bits.length) {
          verdict = "false";
          because = `${bits.join(", and ")}.`;
          evidence = refsOf([...failed, ...events.filter((e) => e.system === "LedgerOne" && kept.some((id) => e.object.includes(`/exports/${id}`)))]);
        }
        break;
      }
      case "no-private-link": {
        const hit = flagged.filter((e) => e.source.startsWith("10.20.4."));
        if (hit.length > 0) {
          verdict = "false";
          const hosts = [...new Set(hit.map((e) => e.source))].sort();
          const days = [...new Set(hit.map((e) => date(e.ts)))].sort();
          const label = hit.find((e) => e.detail && /^tb-/.test(e.detail))?.detail;
          because = `Host ${hosts.join(", ")}${label ? `, labelled ${label}` : ""} acted on the private link on ${range(days)}.`;
          evidence = refsOf(hit);
        }
        break;
      }
      case "rotated": {
        const actor = String(c.actor);
        const after = flagged.filter((e) => e.actor === actor && date(e.ts) > String(c.date));
        because = after.length > 0
          ? `${actor} was used outside its pattern ${after.length} times after ${shortDate(String(c.date))}, until ${shortDate(date(after[after.length - 1].ts))}. A rotated secret could keep its name, so rotation cannot be proved or disproved from the logs.`
          : `No off-pattern use of ${actor} after ${shortDate(String(c.date))}, which fits a rotation but does not prove one.`;
        evidence = refsOf(after.slice(-3));
        break;
      }
      case "closed": {
        const after = flagged.filter((e) => date(e.ts) > String(c.date));
        if (after.length > 0) {
          verdict = "false";
          because = `${after.length} flagged events came after ${shortDate(String(c.date))}, the latest on ${shortDate(date(after[after.length - 1].ts))}.`;
          evidence = refsOf(after);
        }
        break;
      }
      case "document": {
        verdict = c.verdict as Verdict;
        because = String(c.because);
        evidence = (c.evidence as EvidenceRef[]) ?? [];
        break;
      }
    }
    return { id: d.id, source: d.source, claim: d.claim, verdict, because, evidence };
  });
}
