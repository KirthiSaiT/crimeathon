import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// icon and aurora are accepted so every screen keeps its call as written; the Terrazzo shell draws neither.
export function PageShell({
  title,
  lead,
  actions,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  lead?: string;
  aurora?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-(--page-width) min-w-0 px-(--gutter) pt-10 pb-24">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 border-b-2 border-[var(--ink)] pb-6">
        <div className="min-w-0">
          <h1>{title}</h1>
          {lead ? <p className="lead mt-3 text-[var(--ink-secondary)]">{lead}</p> : null}
        </div>
        {actions}
      </header>
      <div className="mt-8 flex min-w-0 flex-col gap-12">{children}</div>
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
