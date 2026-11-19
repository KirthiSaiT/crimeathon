import type { Transition } from "framer-motion";

/*
  Spring presets from the GraphProof template. Critically damped by default; bounce is
  reserved for motion a gesture carried.
*/
export const springDefault: Transition = { type: "spring", bounce: 0, visualDuration: 0.4 };
export const springSnappy: Transition = { type: "spring", bounce: 0, visualDuration: 0.28 };
export const springSheet: Transition = { type: "spring", bounce: 0.18, visualDuration: 0.3 };
export const springLayout: Transition = { type: "spring", bounce: 0.05, visualDuration: 0.35 };

export const pressScale = { scale: 0.97 };
