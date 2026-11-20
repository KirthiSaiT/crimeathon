import { parseCSV } from "./csv";
import { parseFacts } from "./facts";
import type { ChangeRow, FileInfo, Kind, Options, Parsed, Register } from "./types";
import { defaultOptions } from "./types";
import type { RegisterKey, SystemName } from "../lib/types";

// A file is recognised by its columns, never by its name, so a renamed or re-exported log still loads.
const REQUIRED: Record<Kind, string[]> = {
  ledger: ["ts_utc", "api_key_id", "caller_ip", "endpoint", "method"],
  helpdesk: ["ts_local", "actor", "actor_type", "action", "source_ip"],
  sso: ["ts_utc", "user", "source_ip", "result", "mfa_result"],
  bluevault: ["epoch_s", "principal", "source_ip", "action", "path"],
  flows: ["ts_utc", "src_ip", "src_label", "dst_system"],
  changes: ["ts_utc", "change_id", "vendor_id", "field", "channel", "approval_ref"],
};
const DEFAULT_ID: Record<Kind, string> = { ledger: "E01", helpdesk: "E02", sso: "E03", bluevault: "E05", flows: "E15", changes: "E19" };

export function detectKind(header: string[]): Kind | null {
  for (const kind of Object.keys(REQUIRED) as Kind[]) {
    if (REQUIRED[kind].every((c) => header.includes(c))) return kind;
  }
  return null;
}

export function normaliseEndpoint(endpoint: string): string {
  return endpoint
    .replace(/\?.*$/, "")
    .split("/")
    .map((s) => (/^V-\d+$/.test(s) ? "V-x" : /^\d+$/.test(s) ? "N" : s))
    .join("/");
}

const isoMs = (s: string) => Date.parse(s);
function localToUtc(s: string, offsetMin: number): number {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return NaN;
  return Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]) - offsetMin * 60000;
}

export function emptyParsed(): Parsed {
  return { events: [], changes: [], register: null, files: [] };
}

export function addFile(into: Parsed, name: string, text: string, options: Partial<Options> = {}): FileInfo | null {
  const opt = { ...defaultOptions, ...options };
  const named = /^E\d{2}/i.exec(name)?.[0].toUpperCase();

  if (name.toLowerCase().endsWith(".json")) {
    try {
      const j = JSON.parse(text) as { export_generated?: string; integrations?: RegisterKey[] };
      const facts = parseFacts(j);
      if (facts && !j.integrations) {
        into.context = facts;
        const info: FileInfo = { name, id: "FACTS", kind: "facts", rows: facts.events.length + facts.claims.length + facts.maintenance.length + facts.enrolled.length };
        into.files.push(info);
        return info;
      }
      if (j.integrations && j.integrations.length > 0 && j.integrations[0].credential_id) {
        into.register = { exported: j.export_generated ?? new Date().toISOString(), keys: j.integrations } satisfies Register;
        const info: FileInfo = { name, id: named ?? "E04", kind: "register", rows: j.integrations.length };
        into.files.push(info);
        return info;
      }
    } catch {
      return null;
    }
    return null;
  }

  const { header, records } = parseCSV(text);
  const kind = detectKind(header);
  if (!kind) return null;
  let id = named ?? DEFAULT_ID[kind];
  // Two files of the same kind must not share a file id, or their line numbers and event ids would collide.
  if (into.files.some((f) => f.id === id)) id = name.replace(/\.[^./\\]+$/, "");

  for (const { line, cols } of records) {
    const base = { id: `${id}:${line}`, file: id, line };
    if (kind === "ledger") {
      const key = cols.api_key_id;
      const sig = `${cols.method} ${normaliseEndpoint(cols.endpoint)}`;
      into.events.push({ ...base, ts: isoMs(cols.ts_utc), system: "LedgerOne", actor: key, actorKind: key.startsWith("user:") ? "user" : "integration", source: cols.caller_ip, sig, action: sig, object: cols.endpoint, detail: cols.user_agent, records: +cols.records_returned || 0, status: cols.status });
    } else if (kind === "helpdesk") {
      into.events.push({ ...base, ts: localToUtc(cols.ts_local, opt.tenantOffsetMin), system: "HelpDeskr", actor: cols.actor, actorKind: cols.actor_type === "integration" ? "integration" : "user", source: cols.source_ip, sig: cols.action, action: cols.action, object: cols.object_id, detail: cols.details, records: 0, status: cols.result });
    } else if (kind === "sso") {
      into.events.push({ ...base, ts: isoMs(cols.ts_utc), system: "SSO", actor: cols.user, actorKind: "user", source: cols.source_ip, sig: `login ${cols.result}`, action: `login.${cols.result}`, object: cols.auth_method, detail: `${cols.failure_reason} ${cols.mfa_result}`.trim(), records: 0, status: cols.result });
    } else if (kind === "bluevault") {
      const who = cols.principal.replace(/^key:/, "");
      const root = cols.path.split("/")[1] ?? "";
      into.events.push({ ...base, ts: (+cols.epoch_s - opt.bluevaultOffsetSec) * 1000, system: "BlueVault", actor: who, actorKind: cols.principal.startsWith("key:") ? "integration" : "user", source: cols.source_ip, sig: `${cols.action} /${root}`, action: cols.action, object: cols.path, detail: "", records: +cols.bytes || 0, status: cols.result });
    } else if (kind === "flows") {
      into.events.push({ ...base, ts: isoMs(cols.ts_utc), system: "Network link", actor: "vendor-link", actorKind: "integration", source: cols.src_ip, sig: `flow ${cols.dst_system}`, action: `flow ${cols.dst_system}`, object: cols.dst_system, detail: cols.src_label, records: +cols.bytes_out || 0, status: cols.result });
    } else {
      const row: ChangeRow = { file: id, line, id: cols.change_id, ts: isoMs(cols.ts_utc), vendorId: cols.vendor_id, vendor: cols.vendor_name, field: cols.field, oldValue: cols.old_value, newValue: cols.new_value, changedBy: cols.changed_by, channel: cols.channel, approvalRef: (cols.approval_ref ?? "").trim(), sourceIp: cols.source_ip, requestId: cols.request_id ?? "" };
      into.changes.push(row);
    }
  }
  const info: FileInfo = { name, id, kind, rows: records.length };
  into.files.push(info);
  return info;
}

export function sortEvents(p: Parsed): Parsed {
  p.events = p.events.filter((e) => Number.isFinite(e.ts)).sort((a, b) => a.ts - b.ts);
  p.changes = p.changes.filter((c) => Number.isFinite(c.ts)).sort((a, b) => a.ts - b.ts);
  return p;
}

export const systemOf = (kind: Kind): SystemName =>
  ({ ledger: "LedgerOne", helpdesk: "HelpDeskr", sso: "SSO", bluevault: "BlueVault", flows: "Network link", changes: "LedgerOne" })[kind] as SystemName;
