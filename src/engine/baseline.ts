import type { Baseline, BaselineActor, Evt, Options } from "./types";

const DAY = 86_400_000;
const dayOf = (ts: number) => Math.floor(ts / DAY);

// Learn what is normal for every software actor (key, integration account, link host group):
// the computers it is usually used from, and the actions those computers perform.
// The baseline is frozen at a cutoff so the attacker's own traffic cannot teach it to ignore the attack.
export function buildBaseline(events: Evt[], opt: Options): Baseline {
  const integ = events.filter((e) => e.actorKind === "integration");
  if (integ.length === 0) return { cutoff: 0, hosts: new Map(), sigs: new Map(), summary: [] };

  const min = integ[0].ts;
  const max = integ[integ.length - 1].ts;
  const cutoff = min + opt.baselineFraction * (max - min);
  const window = integ.filter((e) => e.ts <= cutoff);

  const daysByHost = new Map<string, Map<string, Set<number>>>();
  const systemOf = new Map<string, Evt["system"]>();
  for (const e of window) {
    systemOf.set(e.actor, e.system);
    if (e.source === "") continue; // a blank address cannot establish a computer
    const hosts = daysByHost.get(e.actor) ?? new Map<string, Set<number>>();
    const days = hosts.get(e.source) ?? new Set<number>();
    days.add(dayOf(e.ts));
    hosts.set(e.source, days);
    daysByHost.set(e.actor, hosts);
  }

  const hosts = new Map<string, Set<string>>();
  const maxDays = new Map<string, number>();
  for (const [actor, byHost] of daysByHost) {
    const top = Math.max(...[...byHost.values()].map((d) => d.size));
    maxDays.set(actor, top);
    hosts.set(actor, new Set([...byHost].filter(([, d]) => d.size >= opt.minHostShare * top).map(([h]) => h)));
  }

  const sigs = new Map<string, Set<string>>();
  for (const e of window) {
    if (!hosts.get(e.actor)?.has(e.source)) continue;
    const set = sigs.get(e.actor) ?? new Set<string>();
    set.add(e.sig);
    sigs.set(e.actor, set);
  }

  const summary: BaselineActor[] = [...hosts.keys()].sort().map((actor) => ({
    actor,
    system: systemOf.get(actor) ?? "LedgerOne",
    hosts: [...(hosts.get(actor) ?? [])].sort(),
    actions: [...(sigs.get(actor) ?? [])].sort(),
    days: maxDays.get(actor) ?? 0,
  }));

  return { cutoff, hosts, sigs, summary };
}
