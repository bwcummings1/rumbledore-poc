import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva("btn", {
  variants: {
    variant: {
      primary: "btn-primary",
      steel: "btn-steel",
      amber: "btn-amber",
      danger: "btn-danger",
      ghost: "btn-ghost",
      "ghost-underline": "btn-link",
      default: "btn-primary",
      outline: "btn-steel",
      secondary: "btn-steel",
      destructive: "btn-danger",
      link: "btn-link",
    },
    size: {
      default: "btn-md",
      md: "btn-md",
      xs: "btn-sm",
      sm: "btn-sm",
      lg: "btn-lg",
      icon: "btn-icon",
      "icon-xs": "btn-icon btn-icon-sm",
      "icon-sm": "btn-icon btn-icon-sm",
      "icon-lg": "btn-icon btn-icon-lg",
    },
    block: {
      true: "btn-block",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

interface ButtonProps
  extends ButtonPrimitive.Props,
    VariantProps<typeof buttonVariants> {
  readonly block?: boolean;
  readonly loading?: boolean;
  readonly loadingLabel?: string;
}

function Button({
  block,
  children,
  className,
  disabled,
  loading = false,
  loadingLabel,
  size = "default",
  variant = "default",
  ...props
}: ButtonProps) {
  assertIconButtonHasAccessibleName(size, props);
  const busyLabel = loadingLabel ?? accessibleLoadingLabel(children, props);

  return (
    <ButtonPrimitive
      aria-busy={loading ? true : undefined}
      data-loading={loading ? "true" : undefined}
      data-slot="button"
      disabled={disabled || loading}
      className={cn(buttonVariants({ block, className, size, variant }))}
      {...props}
    >
      {loading ? (
        <>
          <span
            aria-hidden="true"
            className="inline-flex invisible items-center gap-[inherit]"
          >
            {children}
          </span>
          <span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center"
          >
            <span className="orb orb-xs" />
          </span>
          <span className="sr-only">{busyLabel}</span>
        </>
      ) : (
        children
      )}
    </ButtonPrimitive>
  );
}

function assertIconButtonHasAccessibleName(
  size: ButtonProps["size"],
  props: Omit<
    ButtonProps,
    "block" | "children" | "className" | "loading" | "loadingLabel"
  >,
) {
  if (
    process.env.NODE_ENV === "production" ||
    typeof size !== "string" ||
    !size.startsWith("icon")
  ) {
    return;
  }

  if (!props["aria-label"] && !props["aria-labelledby"]) {
    throw new Error("Icon-only Button requires aria-label or aria-labelledby.");
  }
}

function accessibleLoadingLabel(
  children: ReactNode,
  props: Omit<
    ButtonProps,
    "block" | "children" | "className" | "loading" | "loadingLabel"
  >,
) {
  if (typeof props["aria-label"] === "string") {
    return props["aria-label"];
  }
  if (typeof children === "string") {
    return children;
  }
  return "Loading";
}

export { Button, buttonVariants };
