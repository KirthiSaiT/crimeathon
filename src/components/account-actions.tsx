"use client";

import Link from "next/link";
import { ClipboardList, LogOut, ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IDLE_MINUTES, permissionLabel, roleLabel, roleSummary, useAuth } from "@/components/role-provider";
import { Tag } from "@/components/tag";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

// The top right corner of a page. A visitor who is not signed in gets Sign in and Sign up; once signed in
// it becomes the profile menu. Nothing is shown when the database is not configured, because there is then
// nothing to sign in to.
export function AccountActions() {
  const { status, user, role, permissions, configured, signOut } = useAuth();
  if (!configured || status === "loading") return null;

  if (status !== "signed-in" || !user) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/login" className={cn(buttonVariants({ variant: "default" }))}>
          Sign in
        </Link>
        <Link href="/login?mode=up" className={cn(buttonVariants({ variant: "outline" }))}>
          Sign up
        </Link>
      </div>
    );
  }

  const initial = (user.email[0] ?? "?").toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${user.email}`}
        className="flex h-10 items-center gap-2 border border-[var(--line-strong)] bg-[var(--bg-elevated)] pr-3 pl-1 text-sm outline-none hover:border-[var(--ink)] data-popup-open:border-[var(--ink)]"
      >
        <span aria-hidden="true" className="grid size-8 place-items-center bg-[var(--ink)] text-sm font-bold text-[var(--bg-elevated)]">
          {initial}
        </span>
        <span className="hidden sm:inline">{roleLabel[role]}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex flex-col gap-3 px-3 py-3 text-sm">
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center bg-[var(--ink)] text-base font-bold text-[var(--bg-elevated)]">
              {initial}
            </span>
            <div className="min-w-0">
              <p className="font-mono text-xs break-all">{user.email}</p>
              <p className="mt-1">
                <Tag color="blue">{roleLabel[role]}</Tag>
              </p>
            </div>
          </div>
          <p className="text-[var(--ink-secondary)]">{roleSummary[role]}</p>
          <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5">
            {user.createdAt ? (
              <>
                <dt className="text-[var(--ink-tertiary)]">Member since</dt>
                <dd>{fmtDate(user.createdAt)}</dd>
              </>
            ) : null}
            <dt className="text-[var(--ink-tertiary)]">Session</dt>
            <dd>Ends after {IDLE_MINUTES} minutes idle</dd>
            <dt className="text-[var(--ink-tertiary)]">You can</dt>
            <dd>
              {permissions.length === 0 ? (
                "Nothing yet"
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {permissions.map((p) => (
                    <li key={p}>{permissionLabel[p] ?? p}</li>
                  ))}
                </ul>
              )}
            </dd>
          </dl>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/team" />}>
          <ShieldCheck aria-hidden="true" /> Access and roles
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/activity" />}>
          <ClipboardList aria-hidden="true" /> Activity
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()}>
          <LogOut aria-hidden="true" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
