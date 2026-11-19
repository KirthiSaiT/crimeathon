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
  advice?: KeyAdvice;
}

// What a key actually did before the incident, and the narrower key that would have done the same job.
export interface KeyAdvice {
  used: string[];
  recommendedScope: string;
  hosts: string[];
  recommendedRange: string | null;
  note: string;
}

export type BankStatus = "approved" | "missing" | "bulk" | "out-of-sequence" | "api-channel";

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
  // Days between a change to this supplier's call-back contact (phone or email) and this bank change, when the contact changed first.
  contactChangedDays?: number;
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

export type Role = "viewer" | "analyst" | "approver" | "admin" | "vendor";
