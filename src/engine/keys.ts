import type { KeyRecord, RegisterKey } from "../lib/types";
import type { Register } from "./types";

const MONTH = 1000 * 60 * 60 * 24 * 30.44;

// Score every key in the register against the company's own policy (E10).
export function assessKeys(register: Register, flaggedActors: Set<string>): KeyRecord[] {
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
    return { ...k, score, risk, findings, inIncident: flaggedActors.has(k.credential_id) };
  };

  return register.keys.map(assess).sort((a, b) => b.score - a.score || Number(b.inIncident) - Number(a.inIncident));
}
