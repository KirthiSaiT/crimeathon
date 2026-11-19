import "./app.css";
import { AnalysisProvider } from "@/components/analysis-provider";
import { AuthGate } from "@/components/auth-gate";
import { NavBar } from "@/components/nav-bar";

// `.ws` gates the inner pages' look (app.css). The home page is outside this group and never carries it.
// Everything in this group needs a signed-in person; AuthGate sends everyone else to the sign-in page.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AnalysisProvider>
      <AuthGate nav={<NavBar />}>{children}</AuthGate>
    </AnalysisProvider>
  );
}
