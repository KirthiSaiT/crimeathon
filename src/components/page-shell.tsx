"use client";

import type { LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { AuroraBackground } from "@/components/aceternity/aurora-background";
import { Reveal } from "@/components/aceternity/reveal";
import { TextGenerate } from "@/components/aceternity/text-generate";
import { springDefault } from "@/lib/spring";
import { cn } from "@/lib/utils";

export function PageShell({
  icon: Icon,
  title,
  lead,
  aurora = false,
  children,
}: {
  icon: LucideIcon;
  title: string;
  lead?: string;
  aurora?: boolean;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="relative">
      {aurora ? <AuroraBackground className="h-[28rem]" /> : null}
      <div className="relative mx-auto w-full max-w-(--page-width) min-w-0 px-(--gutter) pt-14 pb-24">
        <motion.span
          initial={reduce ? false : { opacity: 0, scale: 0.9, rotate: -8 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ type: "spring", bounce: 0.3, visualDuration: 0.5 }}
          className="mb-5 grid size-12 place-items-center rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-ink)] shadow-[var(--shadow-md)]"
        >
          <Icon className="size-6" strokeWidth={1.75} aria-hidden="true" />
        </motion.span>
        <h1>
          <TextGenerate text={title} />
        </h1>
        {lead ? (
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springDefault, delay: 0.25 }}
            className="lead mt-4 text-[var(--ink-secondary)]"
          >
            {lead}
          </motion.p>
        ) : null}
        <div className="mt-10 flex min-w-0 flex-col gap-12">{children}</div>
      </div>
    </div>
  );
}

export function Section({ title, note, action, children }: { title: string; note?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Reveal>
      <section className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h2>{title}</h2>
            {note ? <p className="mt-1.5 text-sm text-[var(--ink-secondary)]">{note}</p> : null}
          </div>
          {action}
        </div>
        {children}
      </section>
    </Reveal>
  );
}

// A card of labelled facts, one per row.
export function Properties({ items }: { items: { icon: LucideIcon; label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="divide-y divide-[var(--line)]/70 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)]">
      {items.map(({ icon: Icon, label, value }) => (
        <div key={label} className="grid min-h-12 grid-cols-1 items-center gap-1 px-4 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
          <dt className="flex items-center gap-2.5 text-sm text-[var(--ink-secondary)]">
            <Icon className="size-4 shrink-0 text-[var(--ink-tertiary)]" aria-hidden="true" />
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
    <div
      className={cn(
        "flex gap-3 rounded-[var(--radius-lg)] border border-[var(--accent)]/25 border-l-2 border-l-[var(--accent)] bg-[var(--accent-subtle)] p-4 text-sm leading-relaxed",
        className,
      )}
    >
      <Icon className="mt-0.5 size-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
