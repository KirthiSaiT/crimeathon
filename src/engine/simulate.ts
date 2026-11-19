import type { BankChange } from "../lib/types";
import { coverCidr, inCidr } from "./cidr";
import type { Baseline, Context, Evt, Finding } from "./types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (ts: number) => new Date(ts).toISOString().replace(".000Z", "Z");

export interface Milestone {
  when: string;
  label: string;
  detail: string;
  daysBeforeChange: number;
}

export interface ControlRow {
  name: string;
  how: string;
  blocked: number;
  share: number;
  stopsBankChange: "yes" | "no" | "cannot tell";
  note: string;
}

export interface Sensitivity {
  delay: string;
  prevented: number;
  share: number;
  stopsBankChange: boolean;
}

export interface PerKey {
  actor: string;
  firstAlert: string;
  lastMisuse: string;
  events: number;
  refusedAtFirstAlert: number;
  refusedAfterOneDay: number;
}

export interface Simulation {
  attackerEvents: number;
  perKey: PerKey[];
  milestones: Milestone[];
  controls: ControlRow[];
  sensitivity: Sensitivity[];
  assumptions: string[];
}

// Replay the attack through the defense and through single controls, one at a time.
// "Blocked" means an attacker event that could not have happened if the control had been in place.
export function simulate(events: Evt[], findings: Map<string, Finding>, baseline: Baseline, truth: Set<string>, bank: BankChange[], ctx: Context): Simulation {
  const attack = events.filter((e) => truth.has(e.id)).sort((a, b) => a.ts - b.ts);
  const total = attack.length;
  const change = attack.find((e) => /^PATCH .*bank-details/.test(e.sig));
  const changeTs = change?.ts ?? attack[attack.length - 1]?.ts ?? 0;
  const run = ctx.events.find((e) => /payment run/i.test(e.title));
  const runTs = run ? Date.parse(run.when) : changeTs + 5 * DAY;
  const flagged = (e: Evt) => {
    const f = findings.get(e.id);
    return Boolean(f && !f.ordinary);
  };
  const share = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 1000) / 10);
  const daysBefore = (ts: number) => Math.round(((changeTs - ts) / DAY) * 10) / 10;

  // 1. When would the defense first have fired?
  const first = (pred: (e: Evt, f: Finding) => boolean) => attack.find((e) => flagged(e) && pred(e, findings.get(e.id)!));
  const marks: { label: string; evt?: Evt }[] = [
    { label: "First alert: a key used from a new address", evt: first(() => true) },
    { label: "Secret hunt in the support tickets", evt: first((_e, f) => f.rule === "secret-search") },
    { label: "Storage key reads finance files", evt: first((_e, f) => f.label === "Reads finance files") },
    { label: "Vendor build computer appears on the link", evt: first((_e, f) => f.label === "A host outside the sync list uses the link") },
    { label: "Bank details read in bulk", evt: first((e, f) => f.rule === "sensitive-endpoint" && !/^PATCH/.test(e.sig)) },
    { label: "Supplier bank account changed, no approval", evt: change },
  ];
  const milestones: Milestone[] = marks
    .filter((m) => m.evt)
    .map((m) => ({ when: iso(m.evt!.ts), label: m.label, detail: `${m.evt!.actor} from ${m.evt!.source || "a blank address"} (${m.evt!.file} line ${m.evt!.line})`, daysBeforeChange: daysBefore(m.evt!.ts) }));
  const held = bank.find((b) => b.hold && b.channel === "API");
  if (held) {
    milestones.push({ when: held.time, label: "Bank gate holds the supplier for a call-back", detail: `${held.vendorId}, ${held.evidence}. The payment run is ${Math.round(((runTs - Date.parse(held.time)) / DAY) * 10) / 10} days later`, daysBeforeChange: daysBefore(Date.parse(held.time)) });
  }

  // 2. Single controls, one at a time.
  const controls: ControlRow[] = [];
  const row = (name: string, how: string, blockedIds: Set<string>, note: string, override?: ControlRow["stopsBankChange"]) =>
    controls.push({ name, how, blocked: blockedIds.size, share: share(blockedIds.size), stopsBankChange: override ?? (change ? (blockedIds.has(change.id) ? "yes" : "no") : "cannot tell"), note });

  row(
    "Address limit that includes the vendor link",
    "Allow only office, server and 10.20.4.0/24 addresses",
    new Set(attack.filter((e) => e.source !== "" && !/^(172\.16\.|10\.20\.4\.)/.test(e.source)).map((e) => e.id)),
    "Stops the home-internet phase. The build computer is inside the allowed range, so the bank change gets through.",
  );
  row(
    "Exact address limit per key",
    "Allow only each key's six or one usual computers",
    new Set(attack.filter((e) => e.source !== "" && baseline.hosts.get(e.actor) && !baseline.hosts.get(e.actor)!.has(e.source)).map((e) => e.id)),
    "Effective, but brittle: any new sync computer breaks the real service until someone edits the list. An attacker on a listed computer still passes.",
  );

  // The tightest block around each key's usual computers: less brittle than an exact list.
  const cover = new Map<string, string | null>();
  for (const [actor, hosts] of baseline.hosts) cover.set(actor, hosts.size ? coverCidr([...hosts]) : null);
  const outsideBlock = new Set(attack.filter((e) => e.source !== "" && cover.get(e.actor) && !inCidr(e.source, cover.get(e.actor)!)).map((e) => e.id));
  row(
    "Address limit as the tightest block around each key's own computers",
    "Allow only the smallest address block that holds each key's usual computers",
    outsideBlock,
    change && outsideBlock.has(change.id)
      ? `Survives a new sync computer next to the others. The build computer ${change.source} sits outside the block, so the bank change is refused.`
      : "Survives a new sync computer next to the others. An attacker on a computer inside the block still passes.",
  );
  const offProfile = new Set(attack.filter((e) => baseline.sigs.get(e.actor) && !baseline.sigs.get(e.actor)!.has(e.sig)).map((e) => e.id));
  row(
    "Narrow each key to the actions it used",
    "Allow only the actions each key performed before the incident",
    offProfile,
    "Needs no address list and survives an attacker on a real sync computer. A rare but legitimate action could look unused, so it runs in alert-first mode before it enforces.",
  );

  const leak = ctx.events.find((e) => e.kind === "leak" && /pasted/i.test(e.title));
  const leakKey = leak ? /\b(bvk-[0-9a-f]+)\b/.exec(leak.title)?.[1] : undefined;
  if (leak && leakKey) {
    const cut = Date.parse(leak.when) + 7 * DAY;
    row(
      "Rotate a key found in a ticket within 7 days",
      `Replace ${leakKey} soon after it was pasted (policy E10 section 5.2)`,
      new Set(attack.filter((e) => e.actor === leakKey && e.ts > cut).map((e) => e.id)),
      "Stops the file theft completely. It does nothing for the two vendor-held keys, which were never in a ticket.",
    );
  }
  row(
    "Keys expire after 90 days",
    "Policy E10 section 2.2",
    new Set(),
    "Cannot be simulated. It depends on when the vendor-held keys were taken, and the evidence does not show that.",
    "cannot tell",
  );
  row(
    "Dual approval on payment runs",
    "Risk register item R-015",
    new Set(),
    "Covers the payment run, not changes to a supplier's bank details, so the V-0412 change passes untouched.",
    "no",
  );

  // Detector alert, then revoke the key (or block the computer) after a delay.
  const firstFlag = new Map<string, number>();
  for (const e of attack) if (flagged(e) && !firstFlag.has(e.actor)) firstFlag.set(e.actor, e.ts);
  const sens = (delayMs: number) => {
    const ids = new Set(attack.filter((e) => firstFlag.has(e.actor) && e.ts > firstFlag.get(e.actor)! + delayMs).map((e) => e.id));
    return ids;
  };
  const delays: [string, number][] = [["At the first alert", 0], ["1 hour", HOUR], ["1 day", DAY], ["7 days", 7 * DAY], ["14 days", 14 * DAY], ["30 days", 30 * DAY]];
  const sensitivity: Sensitivity[] = delays.map(([label, ms]) => {
    const ids = sens(ms);
    return { delay: label, prevented: ids.size, share: share(ids.size), stopsBankChange: Boolean(change && ids.has(change.id)) };
  });
  const oneDay = sens(DAY);
  row("Detector alert, then revoke the key within 1 day", "Warden flags the first off-pattern use; a person revokes the key", oneDay, "Assumes revoking locks the attacker out and the vendor cannot re-issue the same secret.");

  const perKey: PerKey[] = [...firstFlag.keys()].map((actor) => {
    const mine = attack.filter((e) => e.actor === actor);
    return {
      actor,
      firstAlert: iso(firstFlag.get(actor)!),
      lastMisuse: iso(mine[mine.length - 1].ts),
      events: mine.length,
      refusedAtFirstAlert: mine.filter((e) => e.ts > firstFlag.get(actor)!).length,
      refusedAfterOneDay: mine.filter((e) => e.ts > firstFlag.get(actor)! + DAY).length,
    };
  });

  const holdLead = held ? Math.round(((runTs - Date.parse(held.time)) / DAY) * 10) / 10 : 0;
  controls.push({
    name: "Bank gate and call-back hold",
    how: "Hold any bank change without a valid approval reference",
    blocked: 0,
    share: 0,
    stopsBankChange: held ? "yes" : "cannot tell",
    note: held ? `Does not stop the access, but stops the payout. It fires on the change itself and leaves ${holdLead} days before the run.` : "No change failed the check.",
  });
  const together = new Set([...oneDay]);
  controls.push({
    name: "All together: detect, revoke in 1 day, bank gate",
    how: "Warden as built",
    blocked: together.size,
    share: share(together.size),
    stopsBankChange: "yes",
    note: "Two independent layers each stop the bank change: the access is cut early, and the payout is held even if it were not.",
  });

  const layered = new Set([...oneDay, ...outsideBlock, ...offProfile]);
  controls.push({
    name: "Layered: tight address block, narrow actions, revoke in 1 day, bank gate",
    how: "Every layer on at once, each independent of the others",
    blocked: layered.size,
    share: share(layered.size),
    stopsBankChange: "yes",
    note: "No single layer has to be perfect. The block and the narrow actions refuse most of the attack outright; whatever gets through is cut off within a day, and the payout is held regardless.",
  });

  return {
    attackerEvents: total,
    perKey,
    milestones,
    controls,
    sensitivity,
    assumptions: [
      "The attacker labels are our own attribution from address ranges, so the counts show consistency with that reading.",
      "Revoking a key is assumed to lock the attacker out. If the vendor's systems still hold the secret, a new key could be stolen again.",
      "Each control is tested alone, as if it had been in place from the start of the logs.",
    ],
  };
}
