"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Square, ink-filled primary beside a ruled outline. Press feedback is a CSS state, not an animation.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--radius-md)] border text-sm font-medium whitespace-nowrap select-none transition-colors duration-[var(--dur-micro)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)] active:bg-[var(--ink-secondary)]",
        secondary: "border-[var(--line-strong)] bg-[var(--bg-elevated)] text-[var(--ink)] hover:border-[var(--ink)]",
        ghost: "border-transparent text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink)]",
        outline: "border-[var(--ink)] bg-transparent text-[var(--ink)] hover:bg-[var(--bg-elevated)] active:bg-[var(--bg-subtle)]",
        destructive: "border-[var(--tp)] bg-[var(--tp)] text-[var(--bg-elevated)] hover:opacity-90",
        link: "border-transparent text-[var(--ink)] underline underline-offset-4 decoration-[var(--line-strong)] hover:decoration-[var(--signal)]",
      },
      size: {
        xs: "h-8 px-2.5! text-xs",
        sm: "h-9 px-3!",
        default: "h-10 px-4!",
        lg: "h-11 px-5!",
        icon: "h-10 w-10",
        "icon-sm": "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = "Button";

export { Button, buttonVariants };
