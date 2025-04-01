import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Reverted to standard dark theme variants (adjust as needed for final look)
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900", // Adjusted focus ring for dark bg
  {
    variants: {
      variant: {
        // Default: Use primary colors (adjust if needed)
        default:
          "bg-blue-600 text-white shadow-xs hover:bg-blue-700", // Example: Using blue
        // Destructive: Standard destructive
        destructive:
          "bg-red-600 text-white shadow-xs hover:bg-red-700 focus-visible:ring-red-500",
        // Outline: Light border, light text
        outline:
          "border border-slate-600 bg-transparent shadow-xs hover:bg-slate-700 text-slate-100",
        // Secondary: Slightly lighter dark bg
        secondary:
          "bg-slate-700 text-slate-100 shadow-xs hover:bg-slate-600",
        // Ghost: Subtle hover bg
        ghost:
          "hover:bg-slate-700 text-slate-100",
        // Link: Standard link color for dark theme
        link: "text-blue-400 underline-offset-4 hover:underline hover:text-blue-300",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
