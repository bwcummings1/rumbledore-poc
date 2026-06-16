"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode, SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils";
import { fieldControlClasses } from "./control-styles";

interface SelectOption {
  readonly description?: ReactNode;
  readonly disabled?: boolean;
  readonly label: ReactNode;
  readonly value: string;
}

interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  readonly className?: string;
  readonly options: readonly SelectOption[];
  readonly onValueChange?: (value: string) => void;
  readonly placeholder?: ReactNode;
  readonly triggerClassName?: string;
}

function Select({
  className,
  onChange,
  onValueChange,
  options,
  placeholder = "Select",
  triggerClassName,
  ...props
}: SelectProps) {
  const hasEmptyOption = options.some((option) => option.value === "");

  return (
    <span className={cn("relative block w-full", className)}>
      <select
        className={cn(
          fieldControlClasses({ size: "sm" }),
          "appearance-none pr-10",
          triggerClassName,
        )}
        onChange={(event) => {
          onChange?.(event);
          onValueChange?.(event.currentTarget.value);
        }}
        data-slot="select-trigger"
        {...props}
      >
        {hasEmptyOption ? null : (
          <option disabled={true} hidden={true} value="">
            {optionLabel(placeholder)}
          </option>
        )}
        {options.map((option) => (
          <option
            disabled={option.disabled}
            key={option.value}
            title={
              option.description ? optionLabel(option.description) : undefined
            }
            value={option.value}
          >
            {optionLabel(option.label)}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute top-1/2 right-3 flex -translate-y-1/2 text-muted-foreground">
        <ChevronDown aria-hidden="true" className="size-4" />
      </span>
    </span>
  );
}

function optionLabel(label: ReactNode): string {
  if (typeof label === "string") {
    return label;
  }

  if (typeof label === "number") {
    return String(label);
  }

  return "";
}

export { Select };
export type { SelectOption, SelectProps };
