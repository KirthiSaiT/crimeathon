import type { Baseline, Context, Evt, Finding } from "./types";

const SECRET_WORDS = /password|api[_ -]?key|secret|token|bearer|private key|bluevault|bvk-|\bssh\b|vpn login|access key|credential/i;
const FINANCE_WORDS = /\bbank\b|iban|swift|payment instruction|vendor change/i;
const PRIVATE =/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/;

function labelFor(e: Evt, hostNew: boolean, secret: boolean): { rule: Finding["rule"]; label: string; severity: Finding["severity"] } {
  const sig = e.sig;
  if (e.system === "LedgerOne") {
    if (/bank-details/.test(sig)) {
      return /^PATCH/.test(sig)
        ? { rule: "sensitive-endpoint", label: "Changes a supplier bank account", severity: "critical" }
        : { rule: "sensitive-endpoint", label: "Reads supplier bank details", severity: "critical" };
    }
    if (/^(POST|DELETE)\b.*export|\/exports\/N\/download/.test(sig)) return { rule: "export-cycle", label: "Exports data from the finance system", severity: "high" };
    if (/payments\/(search|scheduled)/.test(sig)) return { rule: "off-profile-action", label: "Searches and lists payments", severity: "high" };
    return { rule: hostNew ? "new-host" : "off-profile-action", label: "Uses the key from a new address", severity: "high" };
  }
  if (e.system === "HelpDeskr") {
    if (/^export\./.test(sig)) return { rule: "export-cycle", label: "Exports tickets and deletes the export", severity: "high" };
    if (sig === "ticket.search") {
      if (secret) return { rule: "secret-search", label: "Searches tickets for secrets", severity: "high" };
      if (FINANCE_WORDS.test(e.detail)) return { rule: "secret-search", label: "Searches tickets for bank details", severity: "high" };
      return { rule: "off-profile-action", label: "Searches tickets", severity: "high" };
    }
    return { rule: hostNew ? "new-host" : "off-profile-action", label: "Opens a ticket from a new address", severity: "high" };
  }
  if (e.system === "BlueVault") {
    if (/^list/.test(sig)) return { rule: "new-folder", label: "Lists company folders", severity: "medium" };
    if (/\/(finance|hr)\b/.test(sig)) return { rule: "new-folder", label: "Reads finance files", severity: "critical" };
    return { rule: hostNew ? "new-host" : "new-folder", label: "Reads files from a new address", severity: "high" };
  }
  return { rule: "new-host", label: "A host outside the sync list uses the link", severity: "high" };
}

// Compare every event of a software actor with its frozen baseline, and set aside what is ordinary.
export function detect(events: Evt[], baseline: Baseline, ctx: Context): Map<string, Finding> {
  const out = new Map<string, Finding>();

  // A search is part of a secret hunt when a secret word was searched by the same actor within 30 minutes.
  const secretTimes = new Map<string, number[]>();
  for (const e of events) {
    if (e.actorKind === "integration" && e.sig === "ticket.search" && SECRET_WORDS.test(e.detail)) secretTimes.set(e.actor, [...(secretTimes.get(e.actor) ?? []), e.ts]);
  }
  const inSecretHunt = (e: Evt) => (secretTimes.get(e.actor) ?? []).some((t) => Math.abs(t - e.ts) <= 30 * 60_000);

  for (const e of events) {
    if (e.system === "HelpDeskr" && e.actorKind === "user" && /^export\./.test(e.action)) {
      out.set(e.id, { evtId: e.id, rule: "staff-export", label: "Staff ticket exports", severity: "low", ordinary: true, why: "A staff member exported from an office address and kept the file, as the weekly review does." });
      continue;
    }
    if (e.actorKind !== "integration") continue;

    const usual = baseline.hosts.get(e.actor);
    if (!usual) continue; // no baseline for this actor: nothing to compare with
    const hostNew = e.source !== "" && !usual.has(e.source);
    let sigNew = !(baseline.sigs.get(e.actor)?.has(e.sig) ?? false);

    const enrolled = ctx.enrolled.find((x) => x.actor === e.actor && x.sig === e.sig && e.ts >= Date.parse(x.from));
    if (sigNew && enrolled) {
      sigNew = false;
      if (!hostNew) {
        out.set(e.id, { evtId: e.id, rule: "enrolled-change", label: "Contact-detail sync (release 3.6.0)", severity: "low", ordinary: true, why: `Not flagged. ${enrolled.why}.` });
        continue;
      }
    }
    if (!hostNew && !sigNew) continue;

    if (e.system === "Network link" && hostNew && /sandbox/i.test(e.object)) {
      const win = ctx.maintenance.find((m) => /sandbox/i.test(m.system) && e.ts >= Date.parse(m.from) && e.ts <= Date.parse(m.to));
      if (win) {
        out.set(e.id, { evtId: e.id, rule: "announced-maintenance", label: "Sandbox traffic during announced maintenance", severity: "low", ordinary: true, why: `Not flagged. The destination is the test system and the vendor announced maintenance for this window (${win.source}).` });
        continue;
      }
    }

    const secret = SECRET_WORDS.test(e.detail) || inSecretHunt(e);
    const { rule, label, severity } = labelFor(e, hostNew, secret);
    const usualHosts = [...usual].sort();
    const reasons: string[] = [];
    if (hostNew) reasons.push(`${e.source} is not one of the ${usualHosts.length} computers this actor normally uses (${usualHosts.slice(0, 3).join(", ")}${usualHosts.length > 3 ? ", …" : ""}).`);
    if (sigNew) reasons.push(`"${e.sig}" is not among the ${baseline.sigs.get(e.actor)?.size ?? 0} actions it normally performs.`);
    out.set(e.id, { evtId: e.id, rule, label, severity, ordinary: false, why: reasons.join(" ") });
  }

  // Failed sign-ins: three or more in ten minutes from one outside address on one account.
  const fails = events.filter((e) => e.system === "SSO" && e.status === "failure" && !PRIVATE.test(e.source));
  const byKey = new Map<string, Evt[]>();
  for (const f of fails) byKey.set(`${f.actor}|${f.source}`, [...(byKey.get(`${f.actor}|${f.source}`) ?? []), f]);
  for (const list of byKey.values()) {
    for (let i = 0; i < list.length; i++) {
      const burst = list.filter((x) => x.ts >= list[i].ts && x.ts <= list[i].ts + 10 * 60_000);
      if (burst.length >= 3) {
        for (const b of burst) out.set(b.id, { evtId: b.id, rule: "failed-logins", label: "Failed logins from outside", severity: "medium", ordinary: false, why: `${burst.length} failed sign-ins on ${b.actor} within ten minutes from ${b.source}, an address outside the office and server ranges.` });
      }
    }
  }
  return out;
}
