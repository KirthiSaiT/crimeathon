import { cn } from "@/lib/utils";

export type TagColor = "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "purple" | "pink" | "gray";

// Verdict colours only: red = misuse, amber = needs a decision, green = ordinary, blue = the product's accent.
const colors: Record<TagColor, string> = {
  red: "border-[var(--tp)]/40 bg-[var(--tp)]/12 text-[var(--tp)]",
  orange: "border-[var(--sev-high)]/40 bg-[var(--sev-high)]/12 text-[var(--sev-high)]",
  yellow: "border-[var(--nr)]/45 bg-[var(--nr)]/14 text-[var(--nr)]",
  green: "border-[var(--fp)]/40 bg-[var(--fp)]/12 text-[var(--fp)]",
  teal: "border-[var(--info)]/40 bg-[var(--info)]/12 text-[var(--info)]",
  blue: "border-[var(--accent)]/40 bg-[var(--accent)]/12 text-[var(--accent)]",
  purple: "border-[var(--info)]/40 bg-[var(--info)]/12 text-[var(--info)]",
  pink: "border-[var(--tp)]/40 bg-[var(--tp)]/12 text-[var(--tp)]",
  gray: "border-[var(--line-strong)] bg-transparent text-[var(--ink-secondary)]",
};

export function Tag({ color = "gray", mono = false, className, children }: { color?: TagColor; mono?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold tracking-[0.01em] whitespace-nowrap transition-colors",
        mono && "font-mono font-normal",
        colors[color],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const severityColor: Record<string, TagColor> = { critical: "red", high: "orange", medium: "yellow", low: "gray" };
export const severityLabel: Record<string, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
