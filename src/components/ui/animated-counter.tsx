"use client";

import * as React from "react";
import {
  animate,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
  motion,
} from "framer-motion";

/*
  Counter that springs to its value when scrolled into view. Uses a spring so
  the number settles with the same physics as everything else (§4). Respects
  reduced motion (§14): sets the final value with no animation.
*/
export function AnimatedCounter({
  value,
  suffix = "",
  decimals = 0,
  duration = 1.1,
}: {
  value: number;
  suffix?: string;
  decimals?: number;
  duration?: number;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) =>
    decimals > 0 ? v.toFixed(decimals) : Math.round(v).toString()
  );

  React.useEffect(() => {
    if (!inView) return;
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, {
      type: "spring",
      bounce: 0.15,
      visualDuration: duration,
    });
    return controls.stop;
  }, [inView, value, reduce, duration, mv]);

  return (
    <span ref={ref} className="tabular-nums">
      <motion.span>{rounded}</motion.span>
      {suffix}
    </span>
  );
}
