import type { KeyAdvice, KeyRecord, RegisterKey } from "../lib/types";
import { coverCidr } from "./cidr";
import type { BaselineActor, Register } from "./types";

const VERB: Record<string, string> = { GET: "Read", POST: "Create", PUT: "Change", PATCH: "Change", DELETE: "Delete" };

// An action signature from the logs, in words a person would put on a permission.
export function humanAction(sig: string): string {
  const http = /^(GET|POST|PUT|PATCH|DELETE) \/(?:v\d+\/)?(.+)$/.exec(sig);
  if (http) return `${VERB[http[1]]} ${http[2].replace(/[/-]/g, " ")}`;
  const dotted = /^(\w+)\.(read|write)$/.exec(sig);
  if (dotted) return `${dotted[2] === "read" ? "Read" : "Change"} ${dotted[1]}`;
  const path = /^read (\/.+)$/.exec(sig);
  if (path) return `Read ${path[1]}`;
  if (sig.startsWith("flow ")) return `Network link to ${sig.slice(5)}`;
  return sig;
}

// What a key really did, and the narrow key and tight address range that would have covered it.
function adviseFor(k: RegisterKey, learned: BaselineActor | undefined): KeyAdvice | undefined {
  if (!learned || learned.actions.length === 0) return undefined;
  const used = learned.actions.map(humanAction);
  const range = learned.hosts.length > 0 ? coverCidr(learned.hosts) : null;
  return {
    used,
    recommendedScope: used.join(", "),
    hosts: learned.hosts,
    recommendedRange: range,
    note: `The register grants "${k.scope}". Before the incident this key did ${used.length} ${used.length === 1 ? "thing" : "things"}${learned.hosts.length ? ` from ${learned.hosts.length} ${learned.hosts.length === 1 ? "computer" : "computers"}` : ""}. Everything else the grant allows was never used.${range ? ` Limiting it to ${range} refuses every other address.` : ""}`,
  };
}

const MONTH = 1000 * 60 * 60 * 24 * 30.44;

// Score every key in the register against the company's own policy (E10).
export function assessKeys(register: Register, flaggedActors: Set<string>, learned: BaselineActor[] = []): KeyRecord[] {
  const now = Date.parse(register.exported);
  const monthsSince = (iso: string) => (now - Date.parse(iso)) / MONTH;

  const assess = (k: RegisterKey): KeyRecord => {
    const findings: KeyRecord["findings"] = [];
    let score = 0;
    if (!k.ip_restriction) { score += 2; findings.push({ text: "No address limit", policy: "E10 section 2.1" }); }
    if (k.token_lifetime_days == null) { score += 2; findings.push({ text: "No expiry", policy: "E10 section 2.2" }); }
    else if (k.token_lifetime_days > 90) { score += 1; findings.push({ text: `Lifetime is ${k.token_lifetime_days} days, policy allows 90`, policy: "E10 section 2.2" }); }
    if (/all-modules|admin|all-folders/.test(k.scope)) { score += 2; findings.push({ text: `Scope wider than needed: ${k.scope}`, policy: "E10 section 2.3" }); }
    else if (k.scope === "read:all") { score += 1; findings.push({ text: "Reads everything", policy: "E10 section 2.3" }); }
    const reviewed = monthsSince(k.last_review);
    if (reviewed > 12) { score += 2; findings.push({ text: `Last reviewed ${Math.round(reviewed)} months ago`, policy: "E10 section 3.1" }); }
    const idle = monthsSince(k.last_used);
    if (idle > 6 && k.status === "active") { score += 2; findings.push({ text: `Unused for ${Math.round(idle)} months but still active`, policy: "E11 finding 5" }); }
    const risk = score >= 7 ? "High" : score >= 4 ? "Medium" : "Low";
    const advice = adviseFor(k, learned.find((b) => b.actor === k.credential_id));
    return { ...k, score, risk, findings, inIncident: flaggedActors.has(k.credential_id), ...(advice ? { advice } : {}) };
  };

  return register.keys.map(assess).sort((a, b) => b.score - a.score || Number(b.inIncident) - Number(a.inIncident));
}
