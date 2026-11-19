import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// A data table on the GraphProof card surface: hairline rules between rows, quiet column heads.
export const th = "h-10 px-3 text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-[var(--ink-tertiary)] whitespace-nowrap";
export const td = "px-3 py-3 align-top text-sm";

export function Db({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)]">
      <Table className={cn("min-w-[44rem]", className)}>{children}</Table>
    </div>
  );
}

export { TableBody as DbBody, TableCell as DbCell, TableHead as DbHead, TableHeader as DbHeader, TableRow as DbRow };
