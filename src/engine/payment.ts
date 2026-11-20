import type { BankChange } from "../lib/types";
import { maxOf } from "./num";

const DAY = 86_400_000;

// Given the days of the month payments run on, the run before a moment and the run after it (all at UTC midnight).
export function runsAround(ts: number, days: number[]): { last: number; next: number } | null {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const today = Date.UTC(y, m, d.getUTCDate());
  const runs: number[] = [];
  for (const offset of [-1, 0, 1, 2]) for (const day of days) runs.push(Date.UTC(y, m + offset, day));
  runs.sort((x, y2) => x - y2);
  const last = [...runs].reverse().find((r) => r <= today);
  const next = runs.find((r) => r > today);
  return last !== undefined && next !== undefined ? { last, next } : null;
}

export interface PaymentRun {
  /** The end of the records: the latest bank change. */
  end: number;
  runs: { last: number; next: number } | null;
  /** Held changes that nobody has released: they are not paid. */
  blocked: BankChange[];
  /** Changes since the last run that passed every check, plus holds that were released. */
  payable: BankChange[];
  daysToRun: number;
}

// What the next payment run will pay and what it will not.
// A held change is blocked until its id is in `releasedIds` (a release by a different person from the requester).
export function splitPaymentRun(changes: BankChange[], releasedIds: string[], runDays: number[]): PaymentRun {
  const released = new Set(releasedIds);
  const end = changes.length ? maxOf(changes.map((c) => Date.parse(c.time))) : 0;
  const runs = end && runDays.length ? runsAround(end, runDays) : null;
  const blocked = changes.filter((c) => c.hold && !released.has(c.id));
  const payable = runs ? changes.filter((c) => Date.parse(c.time) > runs.last && (!c.hold || released.has(c.id))) : [];
  const daysToRun = runs ? Math.round(((runs.next - end) / DAY) * 10) / 10 : 0;
  return { end, runs, blocked, payable, daysToRun };
}
