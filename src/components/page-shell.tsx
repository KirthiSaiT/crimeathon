import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageShell({ icon: Icon, title, lead, children }: { icon: LucideIcon; title: string; lead?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-(--page-width) min-w-0 px-(--gutter) pt-16 pb-24">
      <Icon className="mb-4 size-11 text-ink-2" strokeWidth={1.5} aria-hidden="true" />
      <h1>{title}</h1>
      {lead ? <p className="lead mt-3 text-muted-foreground">{lead}</p> : null}
      <div className="mt-8 flex min-w-0 flex-col gap-10">{children}</div>
    </div>
  );
}

export function Section({ title, note, action, children }: { title: string; note?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2>{title}</h2>
          {note ? <p className="mt-1 text-sm text-muted-foreground">{note}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Properties({ items }: { items: { icon: LucideIcon; label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="flex flex-col gap-0.5">
      {items.map(({ icon: Icon, label, value }) => (
        <div key={label} className="grid min-h-8 grid-cols-[9.5rem_1fr] items-center gap-3 rounded-sm px-1 hover:bg-paper-2">
          <dt className="flex items-center gap-2 text-sm text-muted-foreground">
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
    <div className={cn("flex gap-3 rounded-lg bg-paper-2 p-4 text-sm leading-relaxed", className)}>
      <Icon className="mt-0.5 size-5 shrink-0 text-ink-2" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
