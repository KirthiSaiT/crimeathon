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

// A ruled tab strip: a hairline under the row, the selected tab marked by a 2px ink bar.
const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit max-w-full items-center gap-1 overflow-x-auto border-b border-[var(--line)] text-[var(--ink-secondary)]",
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
        "relative -mb-px inline-flex h-10 items-center justify-center gap-1.5 border-b-2 border-transparent px-3.5 text-sm font-medium whitespace-nowrap text-[var(--ink-secondary)] transition-colors outline-none hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--signal)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        "data-active:border-[var(--ink)] data-active:text-[var(--ink)]",
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
