import { cva } from "class-variance-authority";

export const fieldControlClasses = cva(
  "w-full rounded-lg border border-[var(--hair-2)] bg-[var(--control-inset)] px-3 py-2 font-mono text-sm text-foreground shadow-[var(--bevel)] outline-none transition-[background-color,border-color,box-shadow,color] placeholder:text-ink-4 hover:border-[var(--hair-3)] focus-visible:border-primary focus-visible:shadow-[var(--glow-focus-field)] disabled:cursor-not-allowed disabled:opacity-50 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 aria-invalid:border-destructive data-[invalid]:border-destructive read-only:bg-elevated/60",
  {
    variants: {
      tone: {
        default: "",
        money: "metric text-warning placeholder:text-ink-4",
        numeric: "metric tabular-nums",
      },
      size: {
        default: "text-sm",
        sm: "text-xs",
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
  "font-mono text-xs uppercase tracking-[0.14em] text-ink-3";

export const fieldHintClasses = "text-xs text-ink-3";

export const fieldErrorClasses =
  "flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive";

export const controlInsetButtonClasses =
  "absolute top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-control text-muted-foreground transition-[background-color,color] hover:bg-primary/10 hover:text-foreground focus-visible:text-foreground disabled:pointer-events-none disabled:opacity-50";
