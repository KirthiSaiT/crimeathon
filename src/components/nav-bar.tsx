"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, ChartColumn, ClipboardList, FileText, ShieldCheck, Vault, FlaskConical, History, KeyRound, Landmark, Menu, Moon, Scale, Sun, TriangleAlert, Upload, X } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { roleLabel, useAuth } from "@/components/role-provider";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/brand";

export const navCase = [
  { href: "/overview", label: "Overview", icon: FileText },
  { href: "/alerts", label: "Alerts", icon: TriangleAlert },
  { href: "/keys", label: "Keys", icon: KeyRound },
  { href: "/vault", label: "Key vault", icon: Vault },
  { href: "/bank-gate", label: "Bank gate", icon: Landmark },
  { href: "/payment-run", label: "Payment run", icon: CalendarClock },
  { href: "/claims", label: "Vendor claims", icon: Scale },
  { href: "/timeline", label: "Timeline", icon: History },
  { href: "/scorecard", label: "Scorecard", icon: ChartColumn },
  { href: "/simulation", label: "Simulation", icon: FlaskConical },
];
export const navTools = [
  { href: "/upload", label: "Upload logs", icon: Upload },
  { href: "/activity", label: "Activity", icon: ClipboardList },
  { href: "/team", label: "Access", icon: ShieldCheck },
];

function NavGroup({ label, items, pathname, onNavigate }: { label: string; items: typeof navCase; pathname: string; onNavigate?: () => void }) {
  return (
    <div>
      <p className="px-3 pb-1.5 text-xs text-[var(--ink-tertiary)]">{label}</p>
      <ul className="flex flex-col">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-2.5 border-l-2 px-3 text-sm transition-colors duration-[var(--dur-micro)]",
                  active
                    ? "border-[var(--ink)] bg-[var(--bg-elevated)] font-medium text-[var(--ink)]"
                    : "border-transparent text-[var(--ink-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--ink)]",
                )}
              >
                <item.icon className="size-4 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Controls() {
  const { theme, toggle, mounted } = useTheme();
  const { status, user, role, configured, signOut } = useAuth();
  return (
    <div className="flex flex-col gap-2">
      {configured ? (
        status === "signed-in" && user ? (
          <div className="flex flex-col gap-1.5 border border-[var(--line-strong)] bg-[var(--bg-elevated)] p-3 text-sm">
            <span className="truncate font-mono text-xs" title={user.email}>
              {user.email}
            </span>
            <span className="flex items-center justify-between gap-2">
              <span className="text-[var(--ink-tertiary)]">{roleLabel[role]}</span>
              <button type="button" onClick={() => void signOut()} className="underline decoration-[var(--line-strong)] underline-offset-4 hover:decoration-[var(--signal)]">
                Sign out
              </button>
            </span>
          </div>
        ) : (
          <Link href="/login" className="flex h-10 items-center justify-between border border-[var(--line-strong)] bg-[var(--bg-elevated)] px-3 text-sm hover:border-[var(--ink)]">
            <span>{status === "loading" ? "Checking sign-in" : "Guest, read only"}</span>
            <span className="underline decoration-[var(--line-strong)] underline-offset-4">Sign in</span>
          </Link>
        )
      ) : null}
      <button
        type="button"
        onClick={toggle}
        aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
        className="flex h-10 items-center gap-2 border border-[var(--line-strong)] bg-[var(--bg-elevated)] px-3 text-sm outline-none hover:border-[var(--ink)]"
      >
        {mounted && theme === "dark" ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
        {mounted && theme === "dark" ? "Light mode" : "Dark mode"}
      </button>
    </div>
  );
}

function Wordmark() {
  return (
    <Link href="/" className="flex flex-col leading-tight">
      <span className="text-lg font-bold tracking-[var(--track-display)]">{APP_NAME}</span>
      <span className="font-mono text-xs text-[var(--ink-tertiary)]">CR-26-047, H4CK_077</span>
    </Link>
  );
}

// A sidebar from 60rem up (nine destinations earn one); a top bar with a menu below it.
export function NavBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <aside className="sticky top-0 hidden h-screen flex-col gap-6 overflow-y-auto border-r-2 border-[var(--ink)] bg-[var(--bg-subtle)] py-6 min-[60rem]:flex">
        <div className="px-3">
          <Wordmark />
        </div>
        <nav aria-label={`${APP_NAME} sections`} className="flex flex-1 flex-col gap-6">
          <NavGroup label="Case" items={navCase} pathname={pathname} />
          <NavGroup label="Tools" items={navTools} pathname={pathname} />
        </nav>
        <div className="px-3">
          <Controls />
        </div>
      </aside>

      <header className="sticky top-0 z-[var(--z-raised)] border-b-2 border-[var(--ink)] bg-[var(--bg-subtle)] min-[60rem]:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <Wordmark />
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className="grid size-11 place-items-center border border-[var(--line-strong)] bg-[var(--bg-elevated)] outline-none"
          >
            {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
        {open ? (
          <div id="mobile-nav" className="flex max-h-[calc(100vh-3.5rem)] flex-col gap-5 overflow-y-auto border-t border-[var(--line)] py-4">
            <nav aria-label={`${APP_NAME} sections`} className="flex flex-col gap-5">
              <NavGroup label="Case" items={navCase} pathname={pathname} onNavigate={() => setOpen(false)} />
              <NavGroup label="Tools" items={navTools} pathname={pathname} onNavigate={() => setOpen(false)} />
            </nav>
            <div className="px-4">
              <Controls />
            </div>
          </div>
        ) : null}
      </header>
    </>
  );
}
