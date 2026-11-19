import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RoleProvider } from "@/components/role-provider";

export const metadata: Metadata = {
  title: "Warden: key misuse and bank-change review, case CR-26-047",
  description:
    "Review which machine keys acted off their usual pattern, and hold supplier bank changes that have no approval, using the supplied evidence for case CR-26-047.",
};

export const viewport: Viewport = { themeColor: "#fbfbfd" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <head>
        {/* Set the theme before paint so there is no flash. Light is the default; dark is an explicit choice. */}
        <Script
          id="theme-script"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('kg-theme')||'light';document.documentElement.classList.toggle('dark',t==='dark');document.documentElement.style.colorScheme=t;}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full">
        <TooltipProvider delay={800}>
          <RoleProvider>{children}</RoleProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
