"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartColumn, ChevronsUpDown, FileText, FlaskConical, History, KeyRound, Landmark, Scale, TriangleAlert, Upload } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { roleLabel, useRole } from "@/components/role-provider";
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

export function AppSidebar() {
  const pathname = usePathname();
  const { role, setRole } = useRole();

  const renderItems = (items: typeof navCase) =>
    items.map((item) => (
      <SidebarMenuItem key={item.href}>
        <SidebarMenuButton render={<Link href={item.href} />} isActive={pathname === item.href} tooltip={item.label}>
          <item.icon className="text-muted-foreground" aria-hidden="true" />
          <span>{item.label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ));

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="px-3 pt-3">
        <div className="flex items-center gap-2.5 rounded-md px-1.5 py-1">
          <span className="flex size-6 items-center justify-center rounded-sm bg-ink text-paper">
            <KeyRound className="size-3.5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">Key Guard</span>
            <span className="block truncate text-xs text-muted-foreground">Team H4CK_077</span>
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-1">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-medium text-muted-foreground">Case CR-26-047</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(navCase)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-medium text-muted-foreground">Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(navTools)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-3 pb-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-9 w-full items-center justify-between gap-2 rounded-md px-2 text-sm hover:bg-paper-3 data-popup-open:bg-paper-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex size-5 items-center justify-center rounded-full bg-tag-blue-bg text-xs font-medium text-tag-blue-ink">{roleLabel[role][0]}</span>
              <span className="truncate">{roleLabel[role]}</span>
            </span>
            <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-52">
            <DropdownMenuRadioGroup value={role} onValueChange={(v) => setRole(v as Role)}>
              <DropdownMenuRadioItem value="analyst">Analyst: review alerts</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="approver">Approver: release holds</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="viewer">Viewer: read only</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
