"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/components/role-provider";
import { cn } from "@/lib/utils";

// Sign in and sign up, for a visitor who is not signed in. Shown nowhere once someone is signed in,
// and nowhere when the database is not configured, because there is then nothing to sign in to.
export function AccountActions() {
  const { status, configured } = useAuth();
  if (!configured || status !== "signed-out") return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href="/login" className={cn(buttonVariants({ variant: "default" }))}>
        Sign in
      </Link>
      <Link href="/login?mode=up" className={cn(buttonVariants({ variant: "outline" }))}>
        Sign up
      </Link>
    </div>
  );
}
