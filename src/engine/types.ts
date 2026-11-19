import type { Alert, BankChange, Claim, KeyRecord, RegisterKey, ScoreRow, SystemName, TimelineEvent } from "../lib/types";

export type Kind = "ledger" | "helpdesk" | "sso" | "bluevault" | "flows" | "changes";

// One row of any log, in one shape, on one clock (UTC milliseconds).
export interface Evt {
  id: string;
  file: string;
  line: number;
  ts: number;
  system: SystemName;
  actor: string;
  actorKind: "integration" | "user";
  source: string;
  sig: string;
  action: string;
  object: string;
  detail: string;
  records: number;
  status: string;
}

export interface ChangeRow {
  file: string;
  line: number;
  id: string;
  ts: number;
  vendorId: string;
  vendor: string;
  field: string;
  oldValue: string;
  newValue: string;
  changedBy: string;
  channel: string;
  approvalRef: string;
  sourceIp: string;
  requestId: string;
}

export interface Register {
  exported: string;
  keys: RegisterKey[];
}

export interface FileInfo {
  name: string;
  id: string;
  kind: Kind | "register" | "facts";
  rows: number;
}

export interface Parsed {
  events: Evt[];
  changes: ChangeRow[];
  register: Register | null;
  files: FileInfo[];
  // Case facts that came with the upload (a case-facts file), if any.
  context?: Context;
}

export interface Options {
  baselineFraction: number; // share of the time span used to learn "normal"
  minHostShare: number; // a host is established when active on this share of the busiest host's days
  tenantOffsetMin: number; // HelpDeskr logs local time; India is UTC+5:30
  bluevaultOffsetSec: number; // BlueVault clock was never synchronised
  gapHours: number; // events further apart than this start a new alert group
}

export const defaultOptions: Options = {
  baselineFraction: 0.5,
  minHostShare: 0.5,
  tenantOffsetMin: 330,
  bluevaultOffsetSec: 0,
  gapHours: 36,
};

export type RuleId =
  | "new-host"
  | "off-profile-action"
  | "sensitive-endpoint"
  | "secret-search"
  | "export-cycle"
  | "new-folder"
  | "failed-logins"
  | "enrolled-change"
  | "announced-maintenance"
  | "staff-export";

export interface Finding {
  evtId: string;
  rule: RuleId;
  label: string;
  severity: "critical" | "high" | "medium" | "low";
  ordinary: boolean;
  why: string;
}

export interface BaselineActor {
  actor: string;
  system: SystemName;
  hosts: string[];
  actions: string[];
  days: number;
}

export interface Baseline {
  cutoff: number;
  hosts: Map<string, Set<string>>;
  sigs: Map<string, Set<string>>;
  summary: BaselineActor[];
}

export interface ContextEvent {
  when: string;
  title: string;
  system: TimelineEvent["system"];
  kind: TimelineEvent["kind"];
  evidence: { file: string; lines: string }[];
}

export interface Context {
  events: ContextEvent[];
  maintenance: { system: string; from: string; to: string; source: string }[];
  enrolled: { actor: string; sig: string; from: string; why: string }[];
  attackerSources: string[];
  claims: ClaimDef[];
  // Optional facts about the case itself.
  case?: { id: string; name: string; approach?: string };
  paymentRunDays?: number[];
}

export interface ClaimDef {
  id: string;
  source: string;
  claim: string;
  check: { type: string; [k: string]: unknown };
}

import type { Simulation } from "./simulate";

export interface Analysis {
  alerts: Alert[];
  timeline: TimelineEvent[];
  keys: KeyRecord[];
  bank: BankChange[];
  claims: Claim[];
  scorecard: ScoreRow[];
  baseline: BaselineActor[];
  files: FileInfo[];
  simulation: Simulation | null;
  caseInfo: Context["case"] | null;
  paymentRunDays: number[];
  stats: {
    events: number;
    flagged: number;
    ordinary: number;
    cutoff: string;
    labelled: boolean;
    // The span the logs cover, when they have any rows.
    from: string | null;
    to: string | null;
    // When the key register was exported, if one was loaded.
    registerExported: string | null;
    // Where the result came from: nothing loaded, the supplied evidence on the server, or an upload.
    source: "empty" | "supplied" | "upload";
  };
}
