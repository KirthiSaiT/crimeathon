"use client";

import { Suspense, useState } from "react";
import { Vault } from "lucide-react";
import { Callout, PageShell, Section } from "@/components/page-shell";
import { Tag, type TagColor } from "@/components/tag";
import { Db, DbBody, DbCell, DbHead, DbHeader, DbRow, td, th } from "@/components/db";
import { EmptyState, ErrorState, PageSkeleton, TableSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/components/role-provider";
import { formatCountdown, SYSTEMS, useNow, useVault, type KeyStatus, type ManagedKey, type SystemId } from "@/lib/supabase/vault";
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
};
const readOnly = (system: SystemId) => SYSTEMS[system].actions.filter((a) => !a.id.endsWith(".write")).map((a) => a.id);
const minutesText = (seconds: number) => (seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`);

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
  const [busy, setBusy] = useState(false);

  // timing dialog and revoke confirmation
  const [timing, setTiming] = useState<ManagedKey | null>(null);
  const [tMinutes, setTMinutes] = useState("5");
  const [tGrace, setTGrace] = useState("15");
  const [tAuto, setTAuto] = useState(true);
  const [revoking, setRevoking] = useState<ManagedKey | null>(null);

  // console
  const [cSystem, setCSystem] = useState<SystemId>("ledgerone");
  const [cAction, setCAction] = useState("vendors.read");
  const [cKey, setCKey] = useState("");
  const [cParams, setCParams] = useState("{}");
  const [cResult, setCResult] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

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
    const r = await vault.create({ system, name: name.trim(), scope, rotationSeconds, graceSeconds: Math.round(Number(grace) || 0), autoRotate: auto });
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
      const res = await fetch(`/api/sim/${cSystem}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cKey.trim()}` },
        body: JSON.stringify({ action: cAction, params }),
      });
      const body = await res.json().catch(() => ({}));
      setCResult(`${res.status} ${res.ok ? "accepted" : "refused"}\n${JSON.stringify(body, null, 2)}`);
    } catch {
      setCResult("The request did not reach the server.");
    }
    setSending(false);
    vault.reload();
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
      lead="Keys for three simulated systems that replace themselves on a timer an administrator sets. Try a key, rotate it, then try the old one."
    >
      <Callout icon={Vault}>
        <p>
          <span className="font-medium">A simulation.</span> LedgerOne, HelpDeskr and BlueVault here hold made-up data inside this database. Nothing touches a real system, and Warden still cannot change a key anywhere else.
        </p>
      </Callout>

      {message ? (
        <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "text-sm text-[var(--tp)]" : "text-sm text-[var(--fp)]"}>
          {message.text}
        </p>
      ) : null}

      <Section title="Managed keys" note="A rotated key's old secret keeps working only for its grace window, then it is refused.">
        {vault.error ? <ErrorState what="vault" message={vault.error} onRetry={vault.reload} /> : null}
        {!vault.error && vault.keys === null ? <TableSkeleton rows={3} /> : null}
        {vault.keys && vault.keys.length === 0 ? (
          <EmptyState title="No keys yet." body={canManage ? "Create one below. Pick a system, what it may do and how often it rotates." : "An administrator creates the keys."} />
        ) : null}
        {vault.keys && vault.keys.length > 0 ? (
          <div className="overflow-x-auto">
            <Db className="min-w-[60rem]">
              <DbHeader>
                <DbRow className="hover:bg-transparent">
                  <DbHead className={th}>Key</DbHead>
                  <DbHead className={th}>Status</DbHead>
                  <DbHead className={th}>Secret</DbHead>
                  <DbHead className={th}>Allowed to</DbHead>
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
                      </DbCell>
                      <DbCell className={td}>
                        <Tag color={statusColor[k.status]}>{k.status === "quarantined" ? "Quarantined (read only)" : k.status === "revoked" ? "Revoked" : "Active"}</Tag>
                      </DbCell>
                      <DbCell className={`${td} font-mono whitespace-nowrap`}>
                        {k.prefix}… <span className="text-[var(--ink-tertiary)]">v{k.version}</span>
                      </DbCell>
                      <DbCell className={`${td} whitespace-normal`} title={k.scope.join(", ")}>
                        <span className="flex max-w-56 flex-wrap gap-1">
                          {k.scope.map((a) => (
                            <Tag key={a} mono>
                              {a}
                            </Tag>
                          ))}
                        </span>
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
                          <span className="flex flex-wrap gap-1.5">
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
          <div className="grid max-w-3xl gap-6 border-t-2 border-[var(--ink)] pt-4 min-[60rem]:grid-cols-2">
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-sm">
                Name
                <Input name="key-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="nightly-sync" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                System
                <select
                  name="key-system"
                  value={system}
                  onChange={(e) => chooseSystem(e.target.value as SystemId)}
                  className="h-9 border border-[var(--line-strong)] bg-[var(--bg-elevated)] px-2 text-sm"
                >
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
                  <label key={a.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name={`scope-${a.id}`}
                      checked={scope.includes(a.id)}
                      onChange={(e) => setScope(e.target.checked ? [...scope, a.id] : scope.filter((x) => x !== a.id))}
                      className="size-4 accent-primary"
                    />
                    {a.label} <span className="font-mono text-xs text-[var(--ink-tertiary)]">{a.id}</span>
                  </label>
                ))}
              </fieldset>
            </div>
            <div className="flex flex-col gap-4">
              <TimingFields minutes={minutes} setMinutes={setMinutes} grace={grace} setGrace={setGrace} auto={auto} setAuto={setAuto} />
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

      <Section title="Try a key" note="Calls the simulated system over HTTP, the way a real client would. Paste an old secret after a rotation to watch it be refused.">
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
                className="h-9 border border-[var(--line-strong)] bg-[var(--bg-elevated)] px-2 text-sm"
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
                className="h-9 border border-[var(--line-strong)] bg-[var(--bg-elevated)] px-2 text-sm"
              >
                {actions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
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

      <Section title="Activity" note="Every key use, rotation and change, newest first. Refused calls are kept too.">
        {vault.events === null && !vault.error ? <TableSkeleton rows={4} /> : null}
        {vault.events && vault.events.length === 0 ? <EmptyState title="Nothing yet." body="Create a key and try it above." /> : null}
        {vault.events && vault.events.length > 0 ? (
          <div className="overflow-x-auto">
            <Db className="min-w-[52rem]">
              <DbHeader>
                <DbRow className="hover:bg-transparent">
                  <DbHead className={th}>When (UTC)</DbHead>
                  <DbHead className={th}>Result</DbHead>
                  <DbHead className={th}>Key</DbHead>
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
                      <Tag color={outcomeColor[e.outcome] ?? "gray"}>{e.outcome.replace("_", " ")}</Tag>
                    </DbCell>
                    <DbCell className={`${td} whitespace-normal`}>
                      {e.key_name ?? <span className="text-[var(--ink-tertiary)]">unknown</span>}
                      {e.secret_prefix ? <span className="block font-mono text-xs text-[var(--ink-tertiary)]">{e.secret_prefix}…</span> : null}
                    </DbCell>
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
