import "./app.css";
import { AnalysisProvider } from "@/components/analysis-provider";
import { NavBar } from "@/components/nav-bar";

// `.ws` gates the inner pages' look (app.css). The home page is outside this group and never carries it.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AnalysisProvider>
      <div className="ws min-h-screen min-[60rem]:grid min-[60rem]:grid-cols-[15rem_minmax(0,1fr)]">
        <NavBar />
        <main className="min-w-0">{children}</main>
      </div>
    </AnalysisProvider>
  );
}
