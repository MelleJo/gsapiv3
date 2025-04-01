import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Adjusted variants for glass background
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black/30", // Adjusted focus ring and disabled opacity
  {
    variants: {
      variant: {
        // Default: Semi-transparent white bg, white text, subtle border
        default:
          "bg-white/20 text-white shadow-xs hover:bg-white/30 border border-white/30",
        // Destructive: Semi-transparent red bg, white text
        destructive:
          "bg-red-600/70 text-white shadow-xs hover:bg-red-600/80 focus-visible:ring-red-500/50",
        // Outline: Transparent bg, white text, white border
        outline:
          "border border-white/40 bg-transparent shadow-xs hover:bg-white/10 text-white",
        // Secondary: Darker transparent bg, white text
        secondary:
          "bg-black/30 text-white shadow-xs hover:bg-black/40 border border-white/10",
        // Ghost: Transparent bg, white text, subtle hover
        ghost:
          "hover:bg-white/10 text-white",
        // Link: White text, subtle underline on hover
        link: "text-white underline-offset-4 hover:underline hover:text-white/90",
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
