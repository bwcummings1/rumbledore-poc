import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const steelVariant =
  "border-input bg-[var(--panel)] text-[var(--steel-soft)] hover:border-[var(--hair-3)] hover:bg-elevated hover:shadow-raised aria-expanded:border-primary aria-expanded:bg-elevated aria-expanded:text-foreground focus-visible:shadow-[var(--focus-ring-shadow),var(--bevel)]";
const primaryVariant =
  "border-primary/30 bg-[linear-gradient(180deg,var(--lilac-hi),var(--lilac))] text-primary-foreground hover:shadow-[0_0_22px_var(--glow-lilac),var(--bevel)] hover:brightness-105 focus-visible:shadow-[var(--focus-ring-shadow),var(--bevel)]";
const amberVariant =
  "border-warning/40 bg-[linear-gradient(180deg,var(--amber),var(--amber-deep))] text-primary-foreground hover:shadow-[0_0_22px_var(--glow-amber),var(--bevel)] hover:brightness-105 focus-visible:shadow-[var(--focus-ring-shadow),var(--bevel)]";
const dangerVariant =
  "border-destructive/50 bg-destructive/10 text-destructive hover:border-destructive hover:bg-destructive/20 focus-visible:border-destructive focus-visible:shadow-[0_0_0_4px_var(--coral-deep),var(--bevel)]";
const ghostVariant =
  "border-transparent bg-transparent text-muted-foreground shadow-none hover:bg-primary/10 hover:text-foreground aria-expanded:bg-primary/10 aria-expanded:text-foreground focus-visible:shadow-[var(--focus-ring-shadow)]";

const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-control border border-transparent bg-clip-padding font-medium whitespace-nowrap shadow-[var(--bevel)] outline-none select-none transition-[background-color,border-color,box-shadow,color,filter,transform] focus-visible:border-primary active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[loading=true]:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 motion-reduce:transform-none",
  {
    variants: {
      variant: {
        primary: primaryVariant,
        steel: steelVariant,
        amber: amberVariant,
        danger: dangerVariant,
        ghost: ghostVariant,
        "ghost-underline":
          "border-transparent bg-transparent text-primary shadow-none underline-offset-4 hover:text-[var(--lilac-hi)] hover:underline focus-visible:shadow-[var(--focus-ring-shadow)]",
        default: primaryVariant,
        outline: steelVariant,
        secondary: steelVariant,
        destructive: dangerVariant,
        link: "border-transparent bg-transparent text-primary shadow-none underline-offset-4 hover:text-[var(--lilac-hi)] hover:underline focus-visible:shadow-[var(--focus-ring-shadow)]",
      },
      size: {
        default:
          "min-h-11 gap-2 px-4 text-sm has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        md: "min-h-11 gap-2 px-4 text-sm has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "min-h-11 gap-1.5 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        sm: "min-h-11 gap-1.5 px-3 text-xs has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 min-h-12 gap-2.5 px-5 text-base has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-11 min-h-11 min-w-11",
        "icon-xs":
          "size-11 min-h-11 min-w-11 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm":
          "size-11 min-h-11 min-w-11 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg":
          "size-12 min-h-12 min-w-12 [&_svg:not([class*='size-'])]:size-5",
      },
      block: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

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
