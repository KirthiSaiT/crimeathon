import { cn } from "@/lib/utils";

export type TagColor = "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "purple" | "pink" | "gray";

const colors: Record<TagColor, string> = {
  red: "bg-tag-red-bg text-tag-red-ink",
  orange: "bg-tag-orange-bg text-tag-orange-ink",
  yellow: "bg-tag-yellow-bg text-tag-yellow-ink",
  green: "bg-tag-green-bg text-tag-green-ink",
  teal: "bg-tag-teal-bg text-tag-teal-ink",
  blue: "bg-tag-blue-bg text-tag-blue-ink",
  purple: "bg-tag-purple-bg text-tag-purple-ink",
  pink: "bg-tag-pink-bg text-tag-pink-ink",
  gray: "bg-tag-gray-bg text-tag-gray-ink",
};

export function Tag({ color = "gray", mono = false, className, children }: { color?: TagColor; mono?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-sm px-1.5 text-xs font-medium whitespace-nowrap",
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
