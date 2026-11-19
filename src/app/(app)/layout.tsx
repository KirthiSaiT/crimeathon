import { AnalysisProvider } from "@/components/analysis-provider";
import { NavBar } from "@/components/nav-bar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AnalysisProvider>
      <NavBar />
      <main className="min-w-0">{children}</main>
    </AnalysisProvider>
  );
}
