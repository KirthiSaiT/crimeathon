"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

function Tabs({ className, orientation = "horizontal", ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn("group/tabs flex gap-3 data-horizontal:flex-col", className)}
      {...props}
    />
  )
}

// The segmented control of the GraphProof template: a material pill with a solid selected segment.
const tabsListVariants = cva(
  "group/tabs-list material inline-flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-full p-1 text-[var(--ink-secondary)]",
  {
    variants: { variant: { default: "", line: "" } },
    defaultVariants: { variant: "default" },
  },
)

function TabsList({ className, variant = "default", ...props }: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap text-[var(--ink-secondary)] transition-colors outline-none hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        "data-active:bg-[var(--accent)] data-active:text-[var(--accent-ink)] data-active:shadow-[var(--shadow-sm)]",
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return <TabsPrimitive.Panel data-slot="tabs-content" className={cn("flex-1 text-sm outline-none", className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
