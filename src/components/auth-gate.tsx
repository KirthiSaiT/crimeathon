"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/role-provider";

// Warden is for signed-in people only. Anyone who is not signed in is sent to the sign-in page and brought back
// to the page they asked for. Set NEXT_PUBLIC_REQUIRE_SIGN_IN=false to switch this off (the Selenium run does).
const required = process.env.NEXT_PUBLIC_REQUIRE_SIGN_IN !== "false";
const shell = "ws min-h-screen min-[60rem]:grid min-[60rem]:grid-cols-[15rem_minmax(0,1fr)]";

export function AuthGate({ nav, children }: { nav: React.ReactNode; children: React.ReactNode }) {
  const { status, configured } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const gated = required && configured;
  const signedOut = status === "signed-out";
  const onLogin = pathname === "/login";

  useEffect(() => {
    if (gated && signedOut && !onLogin) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [gated, signedOut, onLogin, pathname, router]);

  // Open: no gate, or the person is signed in. The full app, with its sidebar.
  if (!gated || status === "signed-in") {
    return (
      <div className={shell}>
        {nav}
        <main className="min-w-0">{children}</main>
      </div>
    );
  }
  // The sign-in page itself, without the sidebar, for someone who is not signed in.
  if (onLogin) {
    return (
      <div className="ws min-h-screen">
        <main className="min-w-0">{children}</main>
      </div>
    );
  }
  return (
    <div className="ws grid min-h-screen place-items-center px-6">
      <p role="status" className="text-sm text-[var(--ink-secondary)]">
        {signedOut ? "Taking you to sign in." : "Checking sign-in."}
      </p>
    </div>
  );
}
