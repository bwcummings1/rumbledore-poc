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
        "group/switch relative inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-transparent outline-none transition-[box-shadow] focus-visible:shadow-[var(--focus-ring-shadow)] data-[disabled]:opacity-50",
        className,
      )}
      data-slot="switch"
      {...props}
    >
      <span
        aria-hidden="true"
        className="relative inline-flex h-6 w-11 items-center rounded-full border border-[var(--hair-2)] bg-white/[0.06] p-0.5 transition-[background-color,border-color] group-data-[checked]/switch:border-primary/55 group-data-[checked]/switch:bg-primary/35"
      >
        <SwitchPrimitive.Thumb className="block size-[1.0625rem] rounded-full bg-[var(--ink-3)] transition-[transform,background-color,box-shadow] data-[checked]:translate-x-5 data-[checked]:bg-lilac-hi data-[checked]:shadow-[0_0_10px_var(--glow-lilac)] motion-reduce:transition-none" />
      </span>
    </SwitchPrimitive.Root>
  );

  if (!label && !description) {
    return control;
  }

  return (
    <div className="flex items-center gap-3 text-sm text-foreground has-data-[disabled]:opacity-60">
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
