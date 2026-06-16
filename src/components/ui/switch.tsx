"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { type ReactNode, useId } from "react";

import { cn } from "@/lib/utils";

interface SwitchProps extends SwitchPrimitive.Root.Props {
  readonly description?: ReactNode;
  readonly label?: ReactNode;
}

function Switch({
  "aria-describedby": ariaDescribedBy,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  className,
  description,
  label,
  ...props
}: SwitchProps) {
  const id = useId();
  const labelId = label ? `${id}-label` : undefined;
  const descriptionId = description ? `${id}-description` : undefined;
  const control = (
    <SwitchPrimitive.Root
      aria-describedby={cn(ariaDescribedBy, descriptionId)}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy ?? (ariaLabel ? undefined : labelId)}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-input bg-[var(--hull-3)] p-0.5 shadow-[var(--bevel)] outline-none transition-[background-color,border-color,box-shadow] data-[checked]:border-primary data-[checked]:bg-primary focus-visible:shadow-[var(--focus-ring-shadow),var(--bevel)] data-[disabled]:opacity-50",
        className,
      )}
      data-slot="switch"
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-5 rounded-full border border-[var(--line-2)] bg-foreground shadow-raised transition-transform data-[checked]:translate-x-4 motion-reduce:transition-none" />
    </SwitchPrimitive.Root>
  );

  if (!label && !description) {
    return control;
  }

  return (
    <div className="flex min-h-11 items-center gap-3 text-sm text-foreground has-data-[disabled]:opacity-60">
      {control}
      <span className="grid gap-1">
        {label ? (
          <span className="font-medium leading-none" id={labelId}>
            {label}
          </span>
        ) : null}
        {description ? (
          <span className="text-muted-foreground" id={descriptionId}>
            {description}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export { Switch };
export type { SwitchProps };
