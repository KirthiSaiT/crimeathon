"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { pressScale, springSnappy } from "@/lib/spring";

// GraphProof button: pointer-down feedback comes from framer-motion's whileTap; links that use
// buttonVariants() directly get the CSS active state instead.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--radius-md)] text-sm font-medium whitespace-nowrap select-none transition-[background-color,box-shadow,transform,border-color] duration-150 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--accent)] text-[var(--accent-ink)] shadow-[var(--shadow-sm)] hover:bg-[var(--accent-hover)] hover:shadow-[var(--shadow-md)]",
        secondary: "material text-[var(--ink)] hover:bg-[var(--bg-elevated)]",
        ghost: "text-[var(--ink-secondary)] hover:bg-[var(--line)]/50 hover:text-[var(--ink)]",
        outline: "border border-[var(--line-strong)] bg-[var(--bg-elevated)] text-[var(--ink)] shadow-[var(--shadow-sm)] hover:bg-[var(--bg-subtle)]",
        destructive: "bg-[var(--tp)] text-white shadow-[var(--shadow-sm)] hover:opacity-90",
        link: "text-[var(--accent)] underline-offset-4 hover:underline",
      },
      size: {
        xs: "h-7 px-2.5! text-xs",
        sm: "h-8 px-3!",
        default: "h-10 px-4!",
        lg: "h-11 px-5!",
        icon: "h-10 w-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends Omit<React.ComponentProps<typeof motion.button>, "ref">,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <motion.button ref={ref} whileTap={pressScale} transition={springSnappy} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = "Button";

export { Button, buttonVariants };
