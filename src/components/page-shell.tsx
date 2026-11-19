"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileUp, type LucideIcon } from "lucide-react";
import { AccountActions } from "@/components/account-actions";
import { useAnalysis } from "@/components/analysis-provider";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The pages that read the detector's output. With nothing uploaded they show one clear state instead of empty tables.
const CASE_PAGES = ["/overview", "/alerts", "/keys", "/bank-gate", "/payment-run", "/claims", "/timeline", "/scorecard", "/simulation"];

function NoLogs() {
  return (
    <div className="flex max-w-2xl flex-col items-start gap-3 border border-dashed border-[var(--line-strong)] bg-[var(--bg-elevated)] p-6">
      <FileUp className="size-5 text-[var(--ink-tertiary)]" aria-hidden="true" />
      <div>
        <p className="font-medium">No logs loaded yet.</p>
        <p className="mt-1 text-sm text-[var(--ink-secondary)]">Warden starts empty. Upload one or more logs, and every page fills from what the logs say and nothing else.</p>
      </div>
      <Link href="/upload" className={buttonVariants({ variant: "default" })}>
        Upload logs
      </Link>
    </div>
  );
}

// icon and aurora are accepted so every screen keeps its call as written; the Terrazzo shell draws neither.
export function PageShell({
  title,
  lead,
  actions,
  always,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  lead?: string;
  aurora?: boolean;
  actions?: React.ReactNode;
  // shown even when no logs are loaded, for a part of the page that does not depend on them
  always?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { state } = useAnalysis();
  const pathname = usePathname();
  const nothingLoaded = CASE_PAGES.includes(pathname) && state.status === "ready" && state.data.files.length === 0;
  return (
    <div className="mx-auto w-full max-w-(--page-width) min-w-0 px-(--gutter) pt-10 pb-24">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 border-b-2 border-[var(--ink)] pb-6">
        <div className="min-w-0 flex-1 basis-72">
          <h1>{title}</h1>
          {lead ? <p className="lead mt-3 text-[var(--ink-secondary)]">{lead}</p> : null}
        </div>
        <div className="ml-auto shrink-0">{actions ?? <AccountActions />}</div>
      </header>
      <div className="mt-8 flex min-w-0 flex-col gap-12">{nothingLoaded ? <NoLogs /> : children}
        {always}
      </div>
    </div>
  );
}

export function Section({ title, note, action, children }: { title: string; note?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2>{title}</h2>
          {note ? <p className="mt-1.5 text-sm text-[var(--ink-tertiary)]">{note}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// Labelled facts, one per row, on the ledger recipe.
export function Properties({ items }: { items: { icon: LucideIcon; label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="ledger">
      {items.map(({ icon: Icon, label, value }) => (
        <div key={label} className="ledger-row grid min-h-12 grid-cols-1 items-center gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4">
          <dt className="flex items-center gap-2.5 text-sm text-[var(--ink-tertiary)]">
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {label}
          </dt>
          <dd className="flex flex-wrap items-center gap-1.5 text-sm">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Callout({ icon: Icon, children, className }: { icon: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex gap-3 border border-[var(--line)] border-l-[var(--rule-bar)] border-l-[var(--signal)] bg-[var(--bg-elevated)] p-4 text-sm leading-relaxed", className)}>
      <Icon className="mt-0.5 size-5 shrink-0 text-[var(--signal)]" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
