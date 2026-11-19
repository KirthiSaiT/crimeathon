"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ChartColumn, ChevronsUpDown, FileText, FlaskConical, History, KeyRound, Landmark, Moon, Scale, Sun, TriangleAlert, Upload } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { roleLabel, useRole } from "@/components/role-provider";
import { springLayout } from "@/lib/spring";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/brand";
import type { Role } from "@/lib/types";

export const navCase = [
  { href: "/overview", label: "Overview", icon: FileText },
  { href: "/alerts", label: "Alerts", icon: TriangleAlert },
  { href: "/keys", label: "Keys", icon: KeyRound },
  { href: "/bank-gate", label: "Bank gate", icon: Landmark },
  { href: "/claims", label: "Vendor claims", icon: Scale },
  { href: "/timeline", label: "Timeline", icon: History },
  { href: "/scorecard", label: "Scorecard", icon: ChartColumn },
  { href: "/simulation", label: "Simulation", icon: FlaskConical },
];
export const navTools = [{ href: "/upload", label: "Upload logs", icon: Upload }];
const allNav = [...navCase, ...navTools];

/*
  Translucent floating chrome: content scrolls UNDER a blurred material bar, and a scroll-edge fade
  sits beneath it instead of a hard divider. The destinations are one segmented strip whose selected
  pill slides between them.
*/
export function NavBar() {
  const { theme, toggle, mounted } = useTheme();
  const { role, setRole } = useRole();
  const pathname = usePathname();
  const reduce = useReducedMotion();

  return (
    <header className="sticky top-0 z-50">
      <div className="material-thin scroll-edge relative border-b border-[var(--hairline)]">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-5">
          <Link href="/" className="flex items-center gap-2.5 rounded-[var(--radius-sm)]">
            <motion.span
              initial={reduce ? false : { rotate: -12, scale: 0.9, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              transition={{ type: "spring", bounce: 0.3, visualDuration: 0.5 }}
              className="grid size-8 place-items-center rounded-[var(--radius-sm)] bg-[var(--accent)] text-[var(--accent-ink)] shadow-[var(--shadow-sm)]"
            >
              <KeyRound className="size-[18px]" aria-hidden="true" />
            </motion.span>
            <span className="leading-none">
              <span className="vibrant block text-[0.95rem] font-semibold tracking-[-0.01em]">{APP_NAME}</span>
              <span className="block text-[0.68rem] text-[var(--ink-tertiary)]">Case CR-26-047 · Team H4CK_077</span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Change role"
                className="material flex h-10 items-center gap-2 rounded-[var(--radius-md)] px-3 text-sm outline-none hover:bg-[var(--bg-elevated)] data-popup-open:bg-[var(--bg-elevated)]"
              >
                <span className="grid size-5 place-items-center rounded-full bg-[var(--accent-subtle)] text-xs font-semibold text-[var(--accent)]">{roleLabel[role][0]}</span>
                <span className="hidden sm:inline">{roleLabel[role]}</span>
                <ChevronsUpDown className="size-4 text-[var(--ink-tertiary)]" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuRadioGroup value={role} onValueChange={(v) => setRole(v as Role)}>
                  <DropdownMenuRadioItem value="analyst">Analyst: review alerts</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="approver">Approver: release holds</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="viewer">Viewer: read only</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="secondary" size="icon" aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"} onClick={toggle}>
              {mounted && theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          </div>
        </div>
        <nav aria-label="Warden sections" className="mx-auto max-w-6xl overflow-x-auto px-5 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div role="tablist" className="material relative inline-flex min-w-max items-center gap-0.5 rounded-full p-1">
            {allNav.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative z-10 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                    active ? "text-[var(--accent-ink)]" : "text-[var(--ink-secondary)] hover:text-[var(--ink)]",
                  )}
                >
                  {active ? (
                    <motion.span layoutId="nav-pill" transition={springLayout} className="absolute inset-0 -z-10 rounded-full bg-[var(--accent)] shadow-[var(--shadow-sm)]" />
                  ) : null}
                  <item.icon className="size-4" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </header>
  );
}
