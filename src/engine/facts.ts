import type { Context } from "./types";

// Case facts are the things the logs cannot say: a maintenance window, a release that added an action,
// the vendor's claims, the address ranges to label as the attacker. They come from documents, so they are supplied,
// not inferred. This reads one from JSON and accepts it only if it looks like one.
export const emptyContext: Context = { events: [], maintenance: [], enrolled: [], attackerSources: [], claims: [] };

const FACT_KEYS = ["events", "maintenance", "enrolled", "attackerSources", "claims"] as const;

export function parseFacts(value: unknown): Context | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const j = value as Record<string, unknown>;
  if (!FACT_KEYS.some((k) => Array.isArray(j[k]))) return null;
  const list = <T,>(k: string) => (Array.isArray(j[k]) ? (j[k] as T[]) : []);
  const caseInfo = j.case && typeof j.case === "object" ? (j.case as Context["case"]) : undefined;
  const days = Array.isArray(j.paymentRunDays) ? (j.paymentRunDays as unknown[]).filter((d): d is number => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 31) : undefined;
  return {
    events: list("events"),
    maintenance: list("maintenance"),
    enrolled: list("enrolled"),
    attackerSources: list<string>("attackerSources").filter((s) => typeof s === "string"),
    claims: list("claims"),
    ...(caseInfo ? { case: caseInfo } : {}),
    ...(days && days.length ? { paymentRunDays: days } : {}),
  };
}
