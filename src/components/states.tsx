import { CircleX, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="ledger flex flex-col gap-2 p-3" role="status" aria-label="Loading">
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-(--page-width) min-w-0 px-(--gutter) pt-10 pb-24" role="status" aria-label="Loading">
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="mt-4 h-5 w-1/2" />
      <div className="mt-8">
        <TableSkeleton />
      </div>
    </div>
  );
}

export function ErrorState({ what, message, onRetry }: { what: string; message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 border border-[var(--tp)] border-l-[var(--rule-bar)] bg-[var(--tp-subtle)] p-6" role="alert">
      <CircleX className="size-5 text-[var(--tp)]" aria-hidden="true" />
      <div>
        <p className="font-medium">{`The ${what} did not load.`}</p>
        <p className="mt-1 text-sm text-[var(--ink-secondary)]">{message}</p>
      </div>
      <Button variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex flex-col items-start gap-3 border border-dashed border-[var(--line-strong)] bg-[var(--bg-elevated)] p-6">
      <Inbox className="size-5 text-[var(--ink-tertiary)]" aria-hidden="true" />
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-[var(--ink-secondary)]">{body}</p>
      </div>
      {action ? (
        <Button variant="outline" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
