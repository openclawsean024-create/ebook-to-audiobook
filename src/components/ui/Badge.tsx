import { HTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "primary" | "secondary" | "success" | "warning" | "danger";
  size?: "sm" | "md";
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", size = "sm", children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={clsx(
          "inline-flex items-center font-medium rounded-full",
          {
            "bg-zinc-800 text-zinc-300": variant === "default",
            "bg-primary/10 text-primary border border-primary/30": variant === "primary",
            "bg-zinc-700 text-zinc-300": variant === "secondary",
            "bg-green-500/10 text-green-400 border border-green-500/30": variant === "success",
            "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30": variant === "warning",
            "bg-red-500/10 text-red-400 border border-red-500/30": variant === "danger",
            "text-xs px-2 py-0.5": size === "sm",
            "text-sm px-3 py-1": size === "md",
          },
          className
        )}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = "Badge";
