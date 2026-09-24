import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const variants: Record<string, string> = {
  default: "bg-primary/10 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/20 text-amber-600 dark:text-amber-400",
  destructive: "bg-destructive/10 text-destructive",
  outline: "border text-muted-foreground",
  muted: "bg-muted text-muted-foreground",
};

export function Badge({ className, variant = "default", ...props }: HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof variants }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", variants[variant], className)}
      {...props}
    />
  );
}
