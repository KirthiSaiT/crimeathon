import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AnalysisProvider } from "@/components/analysis-provider";
import { Topbar } from "@/components/topbar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider style={{ "--sidebar-width": "15rem" } as React.CSSProperties}>
      <AnalysisProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <Topbar />
          {children}
        </SidebarInset>
      </AnalysisProvider>
    </SidebarProvider>
  );
}
