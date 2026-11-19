import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RoleProvider } from "@/components/role-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  weight: "400",
});

export const metadata: Metadata = {
  title: "Key Guard: key misuse and bank-change review, case CR-26-047",
  description:
    "Review which machine keys acted off their usual pattern, and hold supplier bank changes that have no approval, using the supplied evidence for case CR-26-047.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <TooltipProvider delay={800}>
          <RoleProvider>{children}</RoleProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
