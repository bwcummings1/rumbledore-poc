import { Check, Circle, Dot } from "lucide-react";
import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

type StepStatus = "complete" | "current" | "upcoming";

interface StepItem {
  readonly description?: ReactNode;
  readonly id: string;
  readonly label: ReactNode;
  readonly status: StepStatus;
}

interface StepsProps extends ComponentPropsWithoutRef<"nav"> {
  readonly steps: readonly StepItem[];
}

const statusCopy = {
  complete: "Complete",
  current: "Current",
  upcoming: "Upcoming",
} satisfies Record<StepStatus, string>;

function Steps({ className, steps, ...props }: StepsProps) {
  if (steps.length === 0) {
    return null;
  }

  const currentIndex = Math.max(
    steps.findIndex((step) => step.status === "current"),
    0,
  );
  const currentStep = steps[currentIndex] ?? steps[0];
  const completeCount = steps.filter(
    (step) => step.status === "complete",
  ).length;
  const progress = Math.round(
    (completeCount / Math.max(steps.length, 1)) * 100,
  );

  return (
    <nav
      aria-label={props["aria-label"] ?? "Progress"}
      className={cn("panel grid gap-3 p-3", className)}
      data-slot="steps"
      {...props}
    >
      <div className="sm:hidden">
        <p className="font-display text-xs uppercase text-muted-foreground">
          Step {currentIndex + 1} of {steps.length}
        </p>
        <p className="mt-1 text-sm font-semibold text-foreground">
          {currentStep?.label}
        </p>
        <div
          aria-hidden="true"
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted-foreground/15"
        >
          <span
            className="block h-full rounded-full bg-primary shadow-[0_0_18px_var(--glow-lilac)]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <ol
        className="grid gap-2 sm:grid-cols-[repeat(var(--step-count),minmax(0,1fr))]"
        style={{ "--step-count": steps.length } as CSSProperties}
      >
        {steps.map((step, index) => (
          <li
            aria-current={step.status === "current" ? "step" : undefined}
            className={cn(
              "relative grid gap-2 rounded-control border border-border bg-[var(--panel-2)] p-3 shadow-[var(--bevel)]",
              step.status === "current" &&
                "border-primary/50 bg-primary/10 shadow-[0_0_18px_var(--glow-lilac),var(--bevel)]",
            )}
            key={step.id}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs",
                  step.status === "complete" &&
                    "border-positive/50 bg-positive/15 text-positive",
                  step.status === "current" &&
                    "border-primary/60 bg-primary/20 text-foreground",
                  step.status === "upcoming" &&
                    "border-input bg-[var(--panel)] text-muted-foreground",
                )}
              >
                {step.status === "complete" ? (
                  <Check aria-hidden="true" className="size-4" />
                ) : step.status === "current" ? (
                  <Dot aria-hidden="true" className="size-5" />
                ) : (
                  <Circle aria-hidden="true" className="size-3" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {step.label}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {index + 1}. {statusCopy[step.status]}
                </span>
              </span>
            </div>
            {step.description ? (
              <p className="text-xs text-muted-foreground">
                {step.description}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export { Steps };
export type { StepItem, StepStatus, StepsProps };
