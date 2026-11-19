import { cn } from "@/lib/utils";

export type TagColor = "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "purple" | "pink" | "gray";

// Verdict colours only: red is misuse, amber needs a decision, green is ordinary. Every tag also says its word.
const colors: Record<TagColor, string> = {
  red: "border-[var(--tp)] bg-[var(--tp-subtle)] text-[var(--tp)]",
  orange: "border-[var(--sev-high)] bg-[var(--bg-elevated)] text-[var(--sev-high)]",
  yellow: "border-[var(--nr)] bg-[var(--nr-subtle)] text-[var(--nr)]",
  green: "border-[var(--fp)] bg-[var(--fp-subtle)] text-[var(--fp)]",
  teal: "border-[var(--info)] bg-[var(--bg-elevated)] text-[var(--info)]",
  blue: "border-[var(--ink)] bg-[var(--ink)] text-[var(--accent-ink)]",
  purple: "border-[var(--info)] bg-[var(--bg-elevated)] text-[var(--info)]",
  pink: "border-[var(--tp)] bg-[var(--bg-elevated)] text-[var(--tp)]",
  gray: "border-[var(--line-strong)] bg-transparent text-[var(--ink-secondary)]",
};

export function Tag({ color = "gray", mono = false, className, children }: { color?: TagColor; mono?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center border px-2 py-0.5 text-xs font-medium whitespace-nowrap", mono && "font-mono", colors[color], className)}>
      {children}
    </span>
  );
}

export const severityColor: Record<string, TagColor> = { critical: "red", high: "orange", medium: "yellow", low: "gray" };
export const severityLabel: Record<string, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
