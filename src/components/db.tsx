import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// The ledger: an ink bar on top, hairlines between rows, column heads in the body face at a smaller size.
export const th = "h-10 px-3 text-sm font-medium text-[var(--ink-tertiary)] whitespace-nowrap";
export const td = "px-3 py-3 align-top text-sm";

export function Db({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="ledger">
      <Table className={cn("min-w-[44rem]", className)}>{children}</Table>
    </div>
  );
}

export { TableBody as DbBody, TableCell as DbCell, TableHead as DbHead, TableHeader as DbHeader, TableRow as DbRow };
