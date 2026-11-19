"use client";

import * as React from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/*
  Aceternity-style Aurora background — soft, slow color fields behind the hero.
  Apple constraints applied (§14): the motion is slow and low-contrast, but a
  full-viewport slow oscillation is exactly what reduced-motion users want gone,
  so we freeze it to a static gradient when reduce is set. Large moving field is
  kept semi-transparent while it travels (§14).
*/
export function AuroraBackground({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      <div
        className={cn(
          "absolute -inset-[20%] opacity-60 blur-[60px] will-change-transform",
          !reduce && "gp-aurora"
        )}
        style={{
          background:
            "radial-gradient(40% 50% at 20% 20%, var(--accent), transparent 60%)," +
            "radial-gradient(35% 45% at 80% 25%, var(--tp), transparent 60%)," +
            "radial-gradient(45% 55% at 65% 80%, var(--fp), transparent 62%)," +
            "radial-gradient(30% 40% at 30% 75%, var(--nr), transparent 60%)",
        }}
      />
      {/* fade the aurora into the page so it never fights the content (§12) */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--bg)]/30 to-[var(--bg)]" />
      <style>{`
        @keyframes gp-aurora-drift {
          0%   { transform: translate3d(0,0,0) rotate(0deg) scale(1); }
          50%  { transform: translate3d(2%, -1.5%, 0) rotate(8deg) scale(1.08); }
          100% { transform: translate3d(0,0,0) rotate(0deg) scale(1); }
        }
        .gp-aurora { animation: gp-aurora-drift 24s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .gp-aurora { animation: none; } }
      `}</style>
    </div>
  );
}
