import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-foreground",
        good: "border-transparent bg-good-soft text-good-ink",
        warning: "border-transparent bg-warning-soft text-warning-ink",
        critical: "border-transparent bg-critical-soft text-critical-ink",
        outline: "bg-card text-muted-foreground"
      }
    },
    defaultVariants: { tone: "neutral" }
  }
);

export function Badge({ className, tone, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
