"use client";

import { Suspense, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { PageShell, Section } from "@/components/page-shell";
import { Tag } from "@/components/tag";
import { Db, DbBody, DbCell, DbHead, DbHeader, DbRow, td, th } from "@/components/db";
import { EmptyState, ErrorState, PageSkeleton, TableSkeleton } from "@/components/states";
import { IDLE_MINUTES, roleLabel, roleSummary, useAuth } from "@/components/role-provider";
import { usePermissionMatrix, useSettings, useTeam } from "@/lib/supabase/data";
import { fmtDate } from "@/lib/format";
import type { Role } from "@/lib/types";

const roles: Role[] = ["viewer", "analyst", "approver", "admin", "vendor"];
const permissionLabel: Record<string, string> = {
  view_case: "Read the case data",
  save_run: "Save a detector run",
  review_alert: "Record a decision on an alert",
  request_key_action: "Request a key action",
  resolve_key_action: "Close a key action request",
  request_release: "Ask for a held bank change to be released",
  release_hold: "Release a held bank change",
  view_audit: "Read the audit log",
  manage_roles: "Assign roles",
  manage_settings: "Change the two-person rule",
};

function TeamView() {
  const { status, user, role, configured, can } = useAuth();
  const { rows: matrix, error: matrixError } = usePermissionMatrix();
  const { team, error: teamError, setRole } = useTeam();
  const { twoPersonRule, canChange, setTwoPersonRule } = useSettings();
  const [failure, setFailure] = useState<string | null>(null);

  const has = (r: Role, p: string) => Boolean(matrix?.some((m) => m.role === r && m.permission === p));

  return (
    <PageShell
      icon={ShieldCheck}
      title="Access"
      lead="Who can do what. Every rule here is enforced by the database, so a changed page or a copied request cannot get around it."
    >
      <Section title="Roles" note="A new account starts as a viewer. The first account ever created becomes the administrator.">
        <ul className="ledger">
          {roles.map((r) => (
            <li key={r} className="ledger-row grid gap-1 px-4 py-3 text-sm sm:grid-cols-[12rem_1fr] sm:gap-4">
              <span className="font-medium">
                {roleLabel[r]} {status === "signed-in" && role === r ? <Tag color="blue">You</Tag> : null}
              </span>
              <span className="text-[var(--ink-secondary)]">{roleSummary[r]}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Rules that protect the money" note="These do not depend on anyone choosing to follow them.">
        <ul className="ledger">
          <li className="ledger-row flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="min-w-0">
              <span className="font-medium">Two-person rule</span>
              <span className="mt-0.5 block text-[var(--ink-tertiary)]">A held bank change is released only after a different person has asked for it. Nobody approves their own request.</span>
            </span>
            {status === "signed-in" ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="two-person-rule"
                  checked={twoPersonRule}
                  disabled={!canChange}
                  onChange={(e) => void setTwoPersonRule(e.target.checked).then(setFailure)}
                  className="size-4 accent-primary"
                />
                {twoPersonRule ? "On" : "Off"}
              </label>
            ) : (
              <Tag color="gray">Sign in to see</Tag>
            )}
          </li>
          <li className="ledger-row px-4 py-3 text-sm">
            <span className="font-medium">Sessions end when you are idle</span>
            <span className="mt-0.5 block text-[var(--ink-tertiary)]">After {IDLE_MINUTES} minutes without a click or key press, a signed-in session is closed.</span>
          </li>
          <li className="ledger-row px-4 py-3 text-sm">
            <span className="font-medium">Nobody changes their own role</span>
            <span className="mt-0.5 block text-[var(--ink-tertiary)]">Administrators assign roles to other people. Every change is written to the audit log.</span>
          </li>
        </ul>
        {failure ? (
          <p role="alert" className="text-sm text-[var(--tp)]">
            {failure}
          </p>
        ) : null}
      </Section>

      <Section title="What each role may do" note="Read from the role_permissions table.">
        {!configured ? <EmptyState title="The database is not configured." body="Without it there is no sign-in, so there are no roles to show." /> : null}
        {configured && status !== "signed-in" ? <EmptyState title="Sign in to see the permission table." body="The table is stored in the database, which only answers signed-in visitors." /> : null}
        {matrixError ? <ErrorState what="permission table" message={matrixError} onRetry={() => window.location.reload()} /> : null}
        {status === "signed-in" && !matrixError && matrix === null ? <TableSkeleton rows={6} /> : null}
        {matrix ? (
          <div className="overflow-x-auto">
            <Db className="min-w-[44rem]">
              <DbHeader>
                <DbRow className="hover:bg-transparent">
                  <DbHead className={th}>Permission</DbHead>
                  {roles.map((r) => (
                    <DbHead key={r} className={`${th} text-center`}>
                      {roleLabel[r]}
                    </DbHead>
                  ))}
                </DbRow>
              </DbHeader>
              <DbBody>
                {Object.keys(permissionLabel).map((p) => (
                  <DbRow key={p} className="hover:bg-[var(--bg-subtle)]">
                    <DbCell className={`${td} whitespace-normal`}>{permissionLabel[p]}</DbCell>
                    {roles.map((r) => (
                      <DbCell key={r} className={`${td} text-center`}>
                        {has(r, p) ? <Tag color="green">Yes</Tag> : <span className="text-[var(--ink-muted)]">No</span>}
                      </DbCell>
                    ))}
                  </DbRow>
                ))}
              </DbBody>
            </Db>
          </div>
        ) : null}
      </Section>

      {can("manage_roles") ? (
        <Section title="Accounts" note="Change a role with the list. You cannot change your own.">
          {teamError ? <ErrorState what="accounts" message={teamError} onRetry={() => window.location.reload()} /> : null}
          {!teamError && team === null ? <TableSkeleton rows={3} /> : null}
          {team ? (
            <div className="overflow-x-auto">
              <Db className="min-w-[40rem]">
                <DbHeader>
                  <DbRow className="hover:bg-transparent">
                    <DbHead className={th}>Account</DbHead>
                    <DbHead className={th}>Joined</DbHead>
                    <DbHead className={th}>Role</DbHead>
                  </DbRow>
                </DbHeader>
                <DbBody>
                  {team.map((m) => (
                    <DbRow key={m.id} className="hover:bg-[var(--bg-subtle)]">
                      <DbCell className={`${td} font-mono whitespace-normal break-all`}>{m.email ?? m.display_name ?? m.id}</DbCell>
                      <DbCell className={`${td} num whitespace-nowrap text-[var(--ink-tertiary)]`}>{fmtDate(m.created_at)}</DbCell>
                      <DbCell className={td}>
                        <select
                          name={`role-${m.id}`}
                          aria-label={`Role for ${m.email ?? m.id}`}
                          value={m.role}
                          disabled={m.id === user?.id}
                          onChange={(e) => void setRole(m.id, e.target.value as Role).then(setFailure)}
                          className="h-9 border border-[var(--line-strong)] bg-[var(--bg-elevated)] px-2 text-sm disabled:opacity-60"
                        >
                          {roles.map((r) => (
                            <option key={r} value={r}>
                              {roleLabel[r]}
                            </option>
                          ))}
                        </select>
                      </DbCell>
                    </DbRow>
                  ))}
                </DbBody>
              </Db>
            </div>
          ) : null}
        </Section>
      ) : null}
    </PageShell>
  );
}

export default function TeamPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TeamView />
    </Suspense>
  );
}
