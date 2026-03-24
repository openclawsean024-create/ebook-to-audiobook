import { HTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

export interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "primary" | "success";
}

export const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(
  ({ className, value, max = 100, showLabel = false, size = "md", variant = "primary", ...props }, ref) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

    return (
      <div className="w-full" ref={ref} {...props}>
        {showLabel && (
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-sm text-zinc-400">進度</span>
            <span className="text-sm font-medium text-zinc-300">{Math.round(percentage)}%</span>
          </div>
        )}
        <div
          className={clsx(
            "w-full bg-zinc-800 rounded-full overflow-hidden",
            {
              "h-1": size === "sm",
              "h-2": size === "md",
              "h-3": size === "lg",
            },
            className
          )}
        >
          <div
            className={clsx(
              "h-full rounded-full transition-all duration-300 ease-out",
              {
                "bg-violet-600": variant === "default" || variant === "primary",
                "bg-green-500": variant === "success",
              }
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  }
);

ProgressBar.displayName = "ProgressBar";
