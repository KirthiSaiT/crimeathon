"use client";

import { usePathname } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Tag } from "@/components/tag";
import { roleLabel, useRole } from "@/components/role-provider";
import { navCase, navTools } from "@/components/app-sidebar";

export function Topbar() {
  const pathname = usePathname();
  const { role } = useRole();
  const current = [...navCase, ...navTools].find((n) => n.href === pathname)?.label ?? "Key Guard";

  return (
    <header className="sticky top-0 z-(--z-raised) flex h-12 items-center justify-between gap-3 bg-paper/95 px-3 backdrop-blur-sm">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="text-muted-foreground" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/overview">Case CR-26-047</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{current}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <Tag color="blue">{roleLabel[role]}</Tag>
    </header>
  );
}
