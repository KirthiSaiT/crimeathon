"use client";

import * as React from "react";
import { motion, useMotionTemplate, useMotionValue } from "framer-motion";
import { cn } from "@/lib/utils";

/*
  Aceternity-style spotlight card: a soft radial highlight follows the pointer
  (§2 direct manipulation — the light tracks 1:1 with the cursor). The card
  lifts slightly on hover with a spring. The spotlight is a compositor-friendly
  radial-gradient on a pseudo layer, so it stays smooth (§11).
*/
export function SpotlightCard({
  className,
  children,
  spotlightColor = "var(--accent)",
}: {
  className?: string;
  children: React.ReactNode;
  spotlightColor?: string;
}) {
  const mx = useMotionValue(-200);
  const my = useMotionValue(-200);
  const [hovered, setHovered] = React.useState(false);

  const background = useMotionTemplate`radial-gradient(220px circle at ${mx}px ${my}px, ${spotlightColor}, transparent 70%)`;

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set(e.clientX - r.left);
    my.set(e.clientY - r.top);
  }

  return (
    <motion.div
      onPointerMove={onMove}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      whileHover={{ y: -3 }}
      transition={{ type: "spring", bounce: 0, visualDuration: 0.3 }}
      className={cn(
        "group relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)]",
        className
      )}
    >
      {/* spotlight layer — opacity springs in/out so it materializes, not blinks */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background }}
        animate={{ opacity: hovered ? 0.1 : 0 }}
        transition={{ duration: 0.3 }}
      />
      <div className="relative z-10 h-full">{children}</div>
    </motion.div>
  );
}
