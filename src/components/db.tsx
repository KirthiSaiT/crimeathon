import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Notion-style database table: horizontal rules only, no outer border, sentence-case heads.
export const th = "h-9 px-2 text-sm font-medium text-muted-foreground whitespace-nowrap";
export const td = "px-2 py-2.5 align-top text-sm";

export function Db({ children, className }: { children: React.ReactNode; className?: string }) {
  return <Table className={cn("min-w-[44rem]", className)}>{children}</Table>;
}

export { TableBody as DbBody, TableCell as DbCell, TableHead as DbHead, TableHeader as DbHeader, TableRow as DbRow };
