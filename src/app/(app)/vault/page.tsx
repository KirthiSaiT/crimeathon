"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { Vault } from "lucide-react";
import { Callout, PageShell, Section } from "@/components/page-shell";
import { Tag, type TagColor } from "@/components/tag";
import { Db, DbBody, DbCell, DbHead, DbHeader, DbRow, td, th } from "@/components/db";
import { EmptyState, ErrorState, PageSkeleton, TableSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/components/role-provider";
import {
  formatCountdown,
  parseRanges,
  SOURCES,
  SYSTEMS,
  useNow,
  useVault,
  type KeyStatus,
  type ManagedKey,
  type OnCritical,
  type RangeMode,
  type ReplayResult,
  type SplitKey,
  type SystemId,
} from "@/lib/supabase/vault";
import { fmtTime } from "@/lib/format";

const statusColor: Record<KeyStatus, TagColor> = { active: "green", quarantined: "yellow", revoked: "red" };
const outcomeColor: Record<string, TagColor> = {
  accepted: "green",
  refused: "red",
  created: "blue",
  rotated: "blue",
  quarantined: "yellow",
  released: "gray",
  revoked: "red",
  revealed: "orange",
  timing_changed: "gray",
  settings_changed: "gray",
  flagged: "yellow",
  contained: "red",
  held: "orange",
  split: "blue",
};
const modeLabel: Record<RangeMode, string> = { off: "No address limit", monitor: "Monitor: flag, allow", enforce: "Enforce: refuse" };
const criticalLabel: Record<OnCritical, string> = { none: "Only record it", quarantine: "Quarantine (read only)", revoke: "Revoke" };
const readOnly = (system: SystemId) => SYSTEMS[system].actions.filter((a) => !a.id.endsWith(".write")).map((a) => a.id);
const minutesText = (seconds: number) => (seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`);
const httpColor = (status: string): TagColor => (status.startsWith("2") ? (status === "202" ? "yellow" : "green") : "red");
const selectClass = "h-9 border border-[var(--line-strong)] bg-[var(--bg-elevated)] px-2 text-sm";

function SecretDialog({ secret, title, onClose }: { secret: string | null; title: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open={secret !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Copy it now and keep it somewhere safe. The vault shows secrets only to administrators, and each time one is shown it is logged.</DialogDescription>
        </DialogHeader>
        <p className="border border-[var(--line-strong)] bg-[var(--bg-subtle)] p-3 font-mono text-sm break-all">{secret}</p>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(secret ?? "");
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TimingFields({ minutes, setMinutes, grace, setGrace, auto, setAuto }: { minutes: string; setMinutes: (v: string) => void; grace: string; setGrace: (v: string) => void; auto: boolean; setAuto: (v: boolean) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm">
        Rotate every (minutes, 1 to 1440)
        <div className="flex flex-wrap items-center gap-2">
          <Input name="rotate-minutes" type="number" min={1} max={1440} step={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} className="w-28" />
          {[1, 2, 5, 15, 60].map((m) => (
            <Button key={m} type="button" size="xs" variant={minutes === String(m) ? "default" : "outline"} onClick={() => setMinutes(String(m))}>
              {m} min
            </Button>
          ))}
        </div>
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        Grace window (seconds the old secret keeps working, 0 to 600)
        <Input name="grace-seconds" type="number" min={0} max={600} step={1} value={grace} onChange={(e) => setGrace(e.target.value)} className="w-28" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="auto-rotate" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="size-4 accent-primary" />
        Rotate automatically (off: the key simply stops working when its time is up)
      </label>
    </div>
  );
}

function GuardFields({
  ranges,
  setRanges,
  mode,
  setMode,
  onCritical,
  setOnCritical,
}: {
  ranges: string;
  setRanges: (v: string) => void;
  mode: RangeMode;
  setMode: (v: RangeMode) => void;
  onCritical: OnCritical;
  setOnCritical: (v: OnCritical) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm">
        Address ranges the key may be used from (comma separated, for example 10.20.4.0/27)
        <Input name="allowed-ranges" value={ranges} onChange={(e) => setRanges(e.target.value)} className="font-mono" placeholder="10.20.4.0/27, 172.16.8.0/24" autoComplete="off" spellCheck={false} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        Address limit
        <select name="range-mode" value={mode} onChange={(e) => setMode(e.target.value as RangeMode)} className={selectClass}>
          {(Object.keys(modeLabel) as RangeMode[]).map((m) => (
            <option key={m} value={m}>
              {modeLabel[m]}
            </option>
          ))}
        </select>
        <span className="text-[var(--ink-tertiary)]">Start in monitor mode, check the flags, then enforce.</span>
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        When something critical happens (a call from the wrong address, an action outside its permissions, a bank-change attempt)
        <select name="on-critical" value={onCritical} onChange={(e) => setOnCritical(e.target.value as OnCritical)} className={selectClass}>
          {(Object.keys(criticalLabel) as OnCritical[]).map((m) => (
            <option key={m} value={m}>
              {criticalLabel[m]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function VaultView() {
  const { status, can, configured } = useAuth();
  const vault = useVault();
  const now = useNow();
  const canManage = can("manage_keys");
  const canQuarantine = can("quarantine_key") || canManage;

  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [secret, setSecret] = useState<{ title: string; value: string } | null>(null);
  const [lastSecret, setLastSecret] = useState("");

  // create form
  const [name, setName] = useState("");
  const [system, setSystem] = useState<SystemId>("ledgerone");
  const [scope, setScope] = useState<string[]>(readOnly("ledgerone"));
  const [minutes, setMinutes] = useState("5");
  const [grace, setGrace] = useState("15");
  const [auto, setAuto] = useState(true);
  const [ranges, setRanges] = useState("");
  const [mode, setMode] = useState<RangeMode>("off");
  const [onCritical, setOnCritical] = useState<OnCritical>("quarantine");
  const [busy, setBusy] = useState(false);

  // dialogs
  const [timing, setTiming] = useState<ManagedKey | null>(null);
  const [tMinutes, setTMinutes] = useState("5");
  const [tGrace, setTGrace] = useState("15");
  const [tAuto, setTAuto] = useState(true);
  const [guard, setGuard] = useState<ManagedKey | null>(null);
  const [gRanges, setGRanges] = useState("");
  const [gMode, setGMode] = useState<RangeMode>("off");
  const [gCritical, setGCritical] = useState<OnCritical>("quarantine");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ManagedKey | null>(null);
  const [splitting, setSplitting] = useState<ManagedKey | null>(null);
  const [retire, setRetire] = useState(true);
  const [splitResult, setSplitResult] = useState<SplitKey[] | null>(null);

  // console
  const [cSystem, setCSystem] = useState<SystemId>("ledgerone");
  const [cAction, setCAction] = useState("vendors.read");
  const [cKey, setCKey] = useState("");
  const [cParams, setCParams] = useState("{}");
  const [cSource, setCSource] = useState("10.20.4.12");
  const [cResult, setCResult] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // replay
  const [replayRes, setReplayRes] = useState<ReplayResult | null>(null);
  const [replaying, setReplaying] = useState(false);

  const done = (error: string | null, ok?: string) => setMessage(error ? { kind: "error", text: error } : ok ? { kind: "ok", text: ok } : null);

  const chooseSystem = (s: SystemId) => {
    setSystem(s);
    setScope(readOnly(s));
  };

  const create = async () => {
    const rotationSeconds = Math.round(Number(minutes) * 60);
    if (!name.trim() || scope.length === 0 || !(rotationSeconds >= 60 && rotationSeconds <= 86400)) {
      done("Give the key a name, at least one permission and a rotation time between 1 and 1440 minutes.");
      return;
    }
    setBusy(true);
    const r = await vault.create({
      system,
      name: name.trim(),
      scope,
      rotationSeconds,
      graceSeconds: Math.round(Number(grace) || 0),
      autoRotate: auto,
      ranges: parseRanges(ranges),
      rangeMode: mode,
      onCritical,
    });
    setBusy(false);
    if (r.error || !r.data) return done(r.error ?? "The key could not be created.");
    setSecret({ title: `Secret for ${name.trim()}`, value: r.data });
    setLastSecret(r.data);
    setName("");
    done(null);
  };

  const openTiming = (k: ManagedKey) => {
    setTiming(k);
    setTMinutes(String(k.rotation_seconds / 60));
    setTGrace(String(k.grace_seconds));
    setTAuto(k.auto_rotate);
  };

  const openGuard = (k: ManagedKey) => {
    setGuard(k);
    setGRanges(k.allowed_ranges.join(", "));
    setGMode(k.range_mode);
    setGCritical(k.on_critical);
    setSuggestion(null);
  };

  const suggest = async () => {
    if (!guard) return;
    const r = await vault.suggestRanges(guard.id);
    if (r.error) return done(r.error);
    const seen = r.data ?? [];
    setSuggestion(seen.length ? seen.join(", ") : "No accepted calls with an address yet. Use the key from the console first.");
    if (seen.length) setGRanges(seen.map((ip) => `${ip}/32`).join(", "));
  };

  const send = async () => {
    setSending(true);
    setCResult(null);
    let params: unknown = {};
    try {
      params = cParams.trim() ? JSON.parse(cParams) : {};
    } catch {
      setSending(false);
      setCResult("The parameters are not valid JSON.");
      return;
    }
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${cKey.trim()}` };
      if (cSource) headers["X-Source-IP"] = cSource;
      const res = await fetch(`/api/sim/${cSystem}`, { method: "POST", headers, body: JSON.stringify({ action: cAction, params }) });
      const body = await res.json().catch(() => ({}));
      setCResult(`${res.status} ${res.status === 202 ? "held for people" : res.ok ? "accepted" : "refused"}\n${JSON.stringify(body, null, 2)}`);
    } catch {
      setCResult("The request did not reach the server.");
    }
    setSending(false);
    vault.reload();
  };

  const runReplay = async () => {
    setReplaying(true);
    setReplayRes(null);
    const r = await vault.replay();
    setReplaying(false);
    if (r.error || !r.data) return done(r.error ?? "The replay could not run.");
    setReplayRes(r.data);
    done(null);
  };

  if (!configured) {
    return (
      <PageShell icon={Vault} title="Key vault" lead="Managed keys that rotate on a timer you set.">
        <EmptyState title="The database is not configured." body="The vault lives in the database. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY." />
      </PageShell>
    );
  }
  if (status !== "signed-in") {
    return (
      <PageShell icon={Vault} title="Key vault" lead="Managed keys that rotate on a timer you set.">
        <EmptyState title={status === "loading" ? "Checking sign-in." : "Sign in to see the vault."} body="Keys and their activity are stored in the database, which only answers signed-in visitors." />
      </PageShell>
    );
  }

  const actions = SYSTEMS[cSystem].actions;

  return (
    <PageShell
      icon={Vault}
      title="Key vault"
      lead="Keys for three simulated systems that rotate on a timer, work only from the right network, hold only the permissions they need, and are cut off the moment they step out of line."
    >
      <Callout icon={Vault}>
        <p>
          <span className="font-medium">A simulation.</span> LedgerOne, HelpDeskr and BlueVault here hold made-up data inside this database. Nothing touches a real system. The address a call comes from is declared by the caller on this page; a real
          gateway reads it from the network.
        </p>
      </Callout>

      {message ? (
        <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "text-sm text-[var(--tp)]" : "text-sm text-[var(--fp)]"}>
          {message.text}
        </p>
      ) : null}

      <Section title="Managed keys" note="A rotated key's old secret keeps working only for its grace window. A critical event cuts a key off automatically, the way its owner chose.">
        {vault.error ? <ErrorState what="vault" message={vault.error} onRetry={vault.reload} /> : null}
        {!vault.error && vault.keys === null ? <TableSkeleton rows={3} /> : null}
        {vault.keys && vault.keys.length === 0 ? (
          <EmptyState title="No keys yet." body={canManage ? "Create one below, or run the attack replay to see every defence work." : "An administrator creates the keys."} />
        ) : null}
        {vault.keys && vault.keys.length > 0 ? (
          <div className="overflow-x-auto">
            <Db className="min-w-[72rem]">
              <DbHeader>
                <DbRow className="hover:bg-transparent">
                  <DbHead className={th}>Key</DbHead>
                  <DbHead className={th}>Status</DbHead>
                  <DbHead className={th}>Secret</DbHead>
                  <DbHead className={th}>Allowed to</DbHead>
                  <DbHead className={th}>Address limit</DbHead>
                  <DbHead className={th}>Timer</DbHead>
                  <DbHead className={th}>Actions</DbHead>
                </DbRow>
              </DbHeader>
              <DbBody>
                {vault.keys.map((k) => {
                  const left = Date.parse(k.expires_at) - now;
                  return (
                    <DbRow key={k.id} className="hover:bg-[var(--bg-subtle)]">
                      <DbCell className={`${td} whitespace-normal`}>
                        <span className="font-medium">{k.name}</span>
                        <span className="block text-[var(--ink-tertiary)]">{SYSTEMS[k.system].label}</span>
                        {k.parent_id ? <span className="block text-[var(--ink-tertiary)]">split from a broader key</span> : null}
                      </DbCell>
                      <DbCell className={td}>
                        <Tag color={statusColor[k.status]}>{k.status === "quarantined" ? "Quarantined (read only)" : k.status === "revoked" ? "Revoked" : "Active"}</Tag>
                      </DbCell>
                      <DbCell className={`${td} font-mono whitespace-nowrap`}>
                        {k.prefix}… <span className="text-[var(--ink-tertiary)]">v{k.version}</span>
                      </DbCell>
                      <DbCell className={`${td} whitespace-normal`}>
                        <span className="flex max-w-56 flex-wrap gap-1">
                          {k.scope.map((a) => (
                            <Tag key={a} mono>
                              {a}
                            </Tag>
                          ))}
                        </span>
                      </DbCell>
                      <DbCell className={`${td} whitespace-normal`}>
                        <Tag color={k.range_mode === "enforce" ? "green" : k.range_mode === "monitor" ? "yellow" : "gray"}>{modeLabel[k.range_mode]}</Tag>
                        {k.allowed_ranges.length ? <span className="mt-1 block font-mono text-xs">{k.allowed_ranges.join(", ")}</span> : null}
                        <span className="mt-1 block text-[var(--ink-tertiary)]">Critical event: {criticalLabel[k.on_critical].toLowerCase()}</span>
                      </DbCell>
                      <DbCell className={`${td} whitespace-nowrap`}>
                        {k.status === "revoked" ? (
                          <span className="text-[var(--ink-tertiary)]">Stopped</span>
                        ) : (
                          <>
                            <span className="num font-mono">{formatCountdown(left)}</span>
                            <span className="block text-[var(--ink-tertiary)]">
                              {k.auto_rotate ? `rotates every ${minutesText(k.rotation_seconds)}` : "then stops"}, grace {k.grace_seconds} s
                            </span>
                          </>
                        )}
                      </DbCell>
                      <DbCell className={td}>
                        {k.status === "revoked" ? null : (
                          <span className="flex max-w-72 flex-wrap gap-1.5">
                            {canManage ? (
                              <>
                                <Button
                                  size="xs"
                                  variant="outline"
                                  onClick={async () => {
                                    const r = await vault.rotate(k.id);
                                    if (r.data) {
                                      setSecret({ title: `New secret for ${k.name}`, value: r.data });
                                      setLastSecret(r.data);
                                    }
                                    done(r.error);
                                  }}
                                >
                                  Rotate now
                                </Button>
                                <Button
                                  size="xs"
                                  variant="outline"
                                  onClick={async () => {
                                    const r = await vault.reveal(k.id);
                                    if (r.data) {
                                      setSecret({ title: `Current secret for ${k.name}`, value: r.data });
                                      setLastSecret(r.data);
                                    }
                                    done(r.error);
                                  }}
                                >
                                  Show secret
                                </Button>
                                <Button size="xs" variant="outline" onClick={() => openTiming(k)}>
                                  Timing
                                </Button>
                                <Button size="xs" variant="outline" onClick={() => openGuard(k)}>
                                  Address limit
                                </Button>
                                <Button size="xs" variant="outline" onClick={() => setSplitting(k)}>
                                  Split
                                </Button>
                              </>
                            ) : null}
                            {canQuarantine ? (
                              <Button size="xs" variant="outline" onClick={async () => done((await vault.setStatus(k.id, k.status === "quarantined" ? "active" : "quarantined")).error)}>
                                {k.status === "quarantined" ? "Release" : "Quarantine"}
                              </Button>
                            ) : null}
                            {canManage ? (
                              <Button size="xs" variant="destructive" onClick={() => setRevoking(k)}>
                                Revoke
                              </Button>
                            ) : null}
                          </span>
                        )}
                      </DbCell>
                    </DbRow>
                  );
                })}
              </DbBody>
            </Db>
          </div>
        ) : null}
      </Section>

      {canManage ? (
        <Section title="New key" note="The secret is shown once, when the key is created or rotated.">
          <div className="grid max-w-5xl gap-6 border-t-2 border-[var(--ink)] pt-4 min-[60rem]:grid-cols-3">
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-sm">
                Name
                <Input name="key-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="nightly-sync" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                System
                <select name="key-system" value={system} onChange={(e) => chooseSystem(e.target.value as SystemId)} className={selectClass}>
                  {(Object.keys(SYSTEMS) as SystemId[]).map((s) => (
                    <option key={s} value={s}>
                      {SYSTEMS[s].label}, {SYSTEMS[s].blurb.toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="flex flex-col gap-1.5 text-sm">
                <legend className="mb-1.5">Allowed to</legend>
                {SYSTEMS[system].actions.map((a) => (
                  <label key={a.id} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      name={`scope-${a.id}`}
                      checked={scope.includes(a.id)}
                      onChange={(e) => setScope(e.target.checked ? [...scope, a.id] : scope.filter((x) => x !== a.id))}
                      className="mt-0.5 size-4 accent-primary"
                    />
                    <span>
                      {a.label} <span className="font-mono text-xs text-[var(--ink-tertiary)]">{a.id}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            </div>
            <TimingFields minutes={minutes} setMinutes={setMinutes} grace={grace} setGrace={setGrace} auto={auto} setAuto={setAuto} />
            <div className="flex flex-col gap-4">
              <GuardFields ranges={ranges} setRanges={setRanges} mode={mode} setMode={setMode} onCritical={onCritical} setOnCritical={setOnCritical} />
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => void create()}>
                  {busy ? "Creating" : "Create key"}
                </Button>
                <Button variant="outline" onClick={async () => done((await vault.resetDemo()).error, "Demo data reset.")}>
                  Reset demo data
                </Button>
              </div>
            </div>
          </div>
        </Section>
      ) : null}

      <Section title="Try a key" note="Calls the simulated system over HTTP, the way a real client would. Pick where the call comes from, then try the wrong place, the wrong action, or an old secret.">
        <div className="grid max-w-3xl gap-4 border-t-2 border-[var(--ink)] pt-4">
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              System
              <select
                name="console-system"
                value={cSystem}
                onChange={(e) => {
                  const s = e.target.value as SystemId;
                  setCSystem(s);
                  setCAction(SYSTEMS[s].actions[0].id);
                  setCParams(SYSTEMS[s].actions[0].params);
                }}
                className={selectClass}
              >
                {(Object.keys(SYSTEMS) as SystemId[]).map((s) => (
                  <option key={s} value={s}>
                    {SYSTEMS[s].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              Action
              <select
                name="console-action"
                value={cAction}
                onChange={(e) => {
                  setCAction(e.target.value);
                  setCParams(actions.find((a) => a.id === e.target.value)?.params ?? "{}");
                }}
                className={selectClass}
              >
                {actions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              Calling from
              <select name="console-source" value={cSource} onChange={(e) => setCSource(e.target.value)} className={selectClass}>
                {SOURCES.map((s) => (
                  <option key={s.ip || "none"} value={s.ip}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            Key (bearer secret)
            <span className="flex gap-2">
              <Input name="console-key" value={cKey} onChange={(e) => setCKey(e.target.value)} placeholder="wk_ledgerone_…" className="font-mono" autoComplete="off" spellCheck={false} />
              {lastSecret ? (
                <Button type="button" variant="outline" onClick={() => setCKey(lastSecret)}>
                  Use latest secret
                </Button>
              ) : null}
            </span>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Parameters (JSON)
            <Input name="console-params" value={cParams} onChange={(e) => setCParams(e.target.value)} className="font-mono" autoComplete="off" spellCheck={false} />
          </label>
          <div>
            <Button disabled={sending || !cKey.trim()} onClick={() => void send()}>
              {sending ? "Sending" : "Send request"}
            </Button>
          </div>
          {cResult ? <pre className="max-h-72 overflow-auto border border-[var(--line)] bg-[var(--bg-elevated)] p-3 font-mono text-xs whitespace-pre-wrap">{cResult}</pre> : null}
        </div>
      </Section>

      {canManage ? (
        <Section title="Attack replay" note="Runs the attack against fresh keys, one step at a time, so you can watch each defence fire: the address limit, the automatic cut-off, the read-only quarantine and the held bank change.">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={replaying} onClick={() => void runReplay()}>
                {replaying ? "Running" : "Run the attack replay"}
              </Button>
              <span className="text-sm text-[var(--ink-tertiary)]">It creates two keys, uses them, and revokes them when it finishes. The log and the held change stay.</span>
            </div>
            {replayRes ? (
              <>
                <ol className="ledger">
                  {replayRes.steps.map((s) => (
                    <li key={s.n} className="ledger-row grid gap-x-4 gap-y-1 px-4 py-3 text-sm min-[60rem]:grid-cols-[2rem_1fr_9rem_5rem_1.4fr_9rem]">
                      <span className="num font-bold">{s.n}</span>
                      <span>{s.title}</span>
                      <span className="font-mono">{s.ip}</span>
                      <span>
                        <Tag color={httpColor(s.status)}>{s.status}</Tag>
                      </span>
                      <span className="text-[var(--ink-secondary)]">{s.result}</span>
                      <span>
                        <Tag color={statusColor[s.key_status]}>{s.key_status === "quarantined" ? "Key: read only" : s.key_status === "revoked" ? "Key: revoked" : "Key: active"}</Tag>
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="text-sm">
                  Supplier V-0412 bank account after the replay: <span className="font-mono">****{replayRes.bank_after}</span>, unchanged. The attempted change is waiting on the{" "}
                  <Link href="/payment-run" className="underline decoration-[var(--line-strong)] underline-offset-4 hover:decoration-[var(--signal)]">
                    payment run page
                  </Link>{" "}
                  ({replayRes.held} held).
                </p>
              </>
            ) : null}
          </div>
        </Section>
      ) : null}

      <Section title="Activity" note="Every key use, rotation, cut-off and change, newest first. Refused calls are kept too, with the address they came from.">
        {vault.events === null && !vault.error ? <TableSkeleton rows={4} /> : null}
        {vault.events && vault.events.length === 0 ? <EmptyState title="Nothing yet." body="Create a key and try it above." /> : null}
        {vault.events && vault.events.length > 0 ? (
          <div className="overflow-x-auto">
            <Db className="min-w-[64rem]">
              <DbHeader>
                <DbRow className="hover:bg-transparent">
                  <DbHead className={th}>When (UTC)</DbHead>
                  <DbHead className={th}>Result</DbHead>
                  <DbHead className={th}>Key</DbHead>
                  <DbHead className={th}>From</DbHead>
                  <DbHead className={th}>System</DbHead>
                  <DbHead className={th}>Action</DbHead>
                  <DbHead className={th}>Detail</DbHead>
                </DbRow>
              </DbHeader>
              <DbBody>
                {vault.events.map((e) => (
                  <DbRow key={e.id} className="hover:bg-[var(--bg-subtle)]">
                    <DbCell className={`${td} num whitespace-nowrap`}>{fmtTime(e.at)}</DbCell>
                    <DbCell className={td}>
                      <span className="flex flex-wrap gap-1">
                        <Tag color={outcomeColor[e.outcome] ?? "gray"}>{e.outcome.replace("_", " ")}</Tag>
                        {e.critical ? <Tag color="red">Critical</Tag> : null}
                      </span>
                    </DbCell>
                    <DbCell className={`${td} whitespace-normal`}>
                      {e.key_name ?? <span className="text-[var(--ink-tertiary)]">unknown</span>}
                      {e.secret_prefix ? <span className="block font-mono text-xs text-[var(--ink-tertiary)]">{e.secret_prefix}…</span> : null}
                    </DbCell>
                    <DbCell className={`${td} font-mono`}>{e.source_ip ?? ""}</DbCell>
                    <DbCell className={td}>{e.system ? (SYSTEMS[e.system as SystemId]?.label ?? e.system) : ""}</DbCell>
                    <DbCell className={`${td} font-mono`}>{e.action ?? ""}</DbCell>
                    <DbCell className={`${td} whitespace-normal`}>{e.reason ?? ""}</DbCell>
                  </DbRow>
                ))}
              </DbBody>
            </Db>
          </div>
        ) : null}
      </Section>

      <SecretDialog secret={secret?.value ?? null} title={secret?.title ?? ""} onClose={() => setSecret(null)} />

      <Dialog open={Boolean(timing)} onOpenChange={(o) => !o && setTiming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Timing for {timing?.name}</DialogTitle>
            <DialogDescription>The new timer counts from the key&apos;s last rotation. A key already past it rotates at the next check.</DialogDescription>
          </DialogHeader>
          <TimingFields minutes={tMinutes} setMinutes={setTMinutes} grace={tGrace} setGrace={setTGrace} auto={tAuto} setAuto={setTAuto} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTiming(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!timing) return;
                const seconds = Math.round(Number(tMinutes) * 60);
                if (!(seconds >= 60 && seconds <= 86400)) return done("Choose a rotation time between 1 and 1440 minutes.");
                const r = await vault.setTiming(timing.id, seconds, Math.round(Number(tGrace) || 0), tAuto);
                done(r.error, "Timing saved.");
                if (!r.error) setTiming(null);
              }}
            >
              Save timing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(guard)} onOpenChange={(o) => !o && setGuard(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Address limit for {guard?.name}</DialogTitle>
            <DialogDescription>
              A key works only from the ranges listed here. In monitor mode a call from elsewhere is allowed and flagged; in enforce mode it is refused and the key is cut off as chosen below.
            </DialogDescription>
          </DialogHeader>
          <GuardFields ranges={gRanges} setRanges={setGRanges} mode={gMode} setMode={setGMode} onCritical={gCritical} setOnCritical={setGCritical} />
          <div className="flex flex-col gap-2 text-sm">
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => void suggest()}>
              Suggest from where it has been used
            </Button>
            {suggestion ? <p className="text-[var(--ink-secondary)]">Addresses seen on accepted calls: {suggestion}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGuard(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!guard) return;
                const r = await vault.setGuard(guard.id, parseRanges(gRanges), gMode, gCritical);
                done(r.error, "Address limit saved.");
                if (!r.error) setGuard(null);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(splitting)} onOpenChange={(o) => !o && setSplitting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Split {splitting?.name} into narrow keys?</DialogTitle>
            <DialogDescription>
              Warden looks at what this key actually did and makes one key for the reads and one for each separate write, each with its own secret and the same timer and address limit. A bank-account change is never included.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="retire-parent" checked={retire} onChange={(e) => setRetire(e.target.checked)} className="size-4 accent-primary" />
            Revoke the broad key afterwards
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSplitting(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!splitting) return;
                const r = await vault.split(splitting.id, retire);
                if (r.error || !r.data) return done(r.error ?? "The key could not be split.");
                setSplitting(null);
                setSplitResult(r.data);
                done(null);
              }}
            >
              Split
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={splitResult !== null} onOpenChange={(o) => !o && setSplitResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{splitResult?.length} narrow keys made</DialogTitle>
            <DialogDescription>Copy each secret now. They are shown once here; an administrator can show them again later, and each time is logged.</DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-72 flex-col gap-3 overflow-auto text-sm">
            {splitResult?.map((s) => (
              <li key={s.name} className="border border-[var(--line)] p-3">
                <p className="font-medium">{s.name}</p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {s.scope.map((a) => (
                    <Tag key={a} mono>
                      {a}
                    </Tag>
                  ))}
                </p>
                <p className="mt-2 font-mono text-xs break-all">{s.secret}</p>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button onClick={() => setSplitResult(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(revoking)} onOpenChange={(o) => !o && setRevoking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke {revoking?.name}?</DialogTitle>
            <DialogDescription>Every secret for this key stops working at once, and it cannot be switched back on. Create a new key if you need one.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevoking(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!revoking) return;
                const r = await vault.setStatus(revoking.id, "revoked");
                done(r.error, "Key revoked.");
                if (!r.error) setRevoking(null);
              }}
            >
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </PageShell>
  );
}

export default function VaultPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <VaultView />
    </Suspense>
  );
}
