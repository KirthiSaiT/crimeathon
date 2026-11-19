import type { EvidenceRef } from "@/lib/types";
import { Tag } from "@/components/tag";

export function EvidenceTags({ items }: { items: EvidenceRef[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((e) => (
        <Tag key={`${e.file}-${e.lines}`} mono className="border-transparent bg-[var(--bg-subtle)] text-[var(--ink-secondary)]">
          {e.lines && e.lines !== "email" ? `${e.file} ${e.lines}` : e.file}
        </Tag>
      ))}
    </span>
  );
}
