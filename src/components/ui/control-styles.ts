import { cva } from "class-variance-authority";

export const fieldControlClasses = cva(
  "min-h-11 w-full rounded-control border border-input bg-[var(--panel-2)] px-3 py-2 text-base text-foreground shadow-[var(--bevel)] outline-none transition-[background-color,border-color,box-shadow,color] placeholder:text-muted-foreground hover:border-[var(--hair-3)] focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 aria-invalid:border-destructive data-[invalid]:border-destructive read-only:bg-elevated/60",
  {
    variants: {
      tone: {
        default: "",
        money: "metric text-warning placeholder:text-muted-foreground",
        numeric: "metric tabular-nums",
      },
      size: {
        default: "text-base",
        sm: "text-sm",
      },
    },
    defaultVariants: {
      size: "default",
      tone: "default",
    },
  },
);

export const fieldRootClasses =
  "grid w-full gap-2 text-sm text-foreground data-[disabled]:opacity-60";

export const fieldLabelClasses =
  "font-display text-xs font-semibold uppercase text-muted-foreground";

export const fieldHintClasses = "text-sm text-muted-foreground";

export const fieldErrorClasses =
  "flex items-start gap-2 rounded-control border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive";

export const controlInsetButtonClasses =
  "absolute top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-control text-muted-foreground transition-[background-color,color] hover:bg-primary/10 hover:text-foreground focus-visible:text-foreground disabled:pointer-events-none disabled:opacity-50";
