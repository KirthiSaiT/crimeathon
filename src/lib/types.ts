export type Severity = "critical" | "high" | "medium" | "low";
export type AlertStatus = "open" | "review" | "ordinary";
export type SystemName = "LedgerOne" | "HelpDeskr" | "BlueVault" | "SSO" | "Network link";

export interface EvidenceRef {
  file: string;
  lines: string;
}

export interface Alert {
  id: string;
  title: string;
  system: SystemName;
  key: string;
  source: string;
  start: string;
  end: string;
  count: number;
  severity: Severity;
  status: AlertStatus;
  rule: string;
  normal: string;
  evidence: EvidenceRef[];
}

export type TimelineKind = "leak" | "theft" | "attack" | "notice" | "context";

export interface TimelineEvent {
  id: string;
  when: string;
  title: string;
  system: SystemName | "Vendor" | "Company";
  kind: TimelineKind;
  evidence: EvidenceRef[];
}

export interface RegisterKey {
  integration: string;
  credential_id: string;
  system: string;
  vendor: string;
  scope: string;
  owner: string;
  created: string;
  last_review: string;
  ip_restriction: boolean;
  token_lifetime_days: number | null;
  last_used: string;
  status: string;
}

export interface KeyRecord extends RegisterKey {
  score: number;
  risk: "High" | "Medium" | "Low";
  findings: { text: string; policy: string }[];
  inIncident: boolean;
}

export type BankStatus = "approved" | "missing" | "bulk" | "out-of-sequence";

export interface BankChange {
  id: string;
  vendorId: string;
  vendor: string;
  oldValue: string;
  newValue: string;
  changedBy: string;
  channel: string;
  approvalRef: string;
  time: string;
  sourceIp: string;
  requestId: string;
  evidence: string;
  status: BankStatus;
  why: string;
  hold: boolean;
}

export type Verdict = "false" | "unproven" | "true";

export interface Claim {
  id: string;
  source: string;
  claim: string;
  verdict: Verdict;
  because: string;
  evidence: EvidenceRef[];
}

export interface ScoreRow {
  name: string;
  detail: string;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

export type Role = "analyst" | "approver" | "viewer";
