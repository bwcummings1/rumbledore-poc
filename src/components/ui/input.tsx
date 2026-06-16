import { Input as InputPrimitive } from "@base-ui/react/input";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  controlInsetButtonClasses,
  fieldControlClasses,
} from "./control-styles";

interface InputProps extends InputPrimitive.Props {
  readonly clearable?: boolean;
  readonly leadingIcon?: ReactNode;
  readonly onClear?: () => void;
  readonly tone?: "default" | "money" | "numeric";
  readonly trailingAffix?: ReactNode;
}

function Input({
  className,
  clearable = false,
  leadingIcon,
  onClear,
  tone = "default",
  trailingAffix,
  value,
  ...props
}: InputProps) {
  const hasTrailing = Boolean(trailingAffix) || (clearable && Boolean(value));
  const input = (
    <InputPrimitive
      className={cn(
        fieldControlClasses({ tone }),
        leadingIcon ? "pl-10" : "",
        hasTrailing ? "pr-10" : "",
        className,
      )}
      data-slot="input"
      value={value}
      {...props}
    />
  );

  if (!leadingIcon && !hasTrailing) {
    return input;
  }

  return (
    <span className="relative block w-full" data-slot="input-shell">
      {leadingIcon ? (
        <span className="pointer-events-none absolute top-1/2 left-3 flex -translate-y-1/2 text-muted-foreground [&_svg:not([class*='size-'])]:size-4">
          {leadingIcon}
        </span>
      ) : null}
      {input}
      {clearable && Boolean(value) ? (
        <button
          aria-label="Clear"
          className={cn(controlInsetButtonClasses, "right-1")}
          disabled={props.disabled}
          onClick={onClear}
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : trailingAffix ? (
        <span className="pointer-events-none absolute top-1/2 right-3 flex -translate-y-1/2 text-sm text-muted-foreground">
          {trailingAffix}
        </span>
      ) : null}
    </span>
  );
}

export { Input };
export type { InputProps };
