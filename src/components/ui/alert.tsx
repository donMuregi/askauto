import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const alertVariants = cva("rounded-xl border px-4 py-3 text-sm", {
  variants: {
    variant: {
      info: "border-border bg-surface-muted text-foreground",
      warning: "border-brand/30 bg-brand-soft text-foreground",
      success: "border-success/20 bg-success-soft text-foreground",
      error: "border-destructive/20 bg-destructive-soft text-destructive",
    },
  },
  defaultVariants: {
    variant: "info",
  },
});

export interface AlertProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

export function Alert({ className, variant, ...props }: AlertProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}
