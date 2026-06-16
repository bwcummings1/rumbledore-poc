import { Bot, CircleGauge, LockKeyhole, Sparkles } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import type { EntitlementReason } from "@/entitlements";
import { cn } from "@/lib/utils";
import { Banner } from "./banner";

type LockedFeatureKind =
  | "arena-advanced"
  | "generic"
  | "league-cast"
  | "lore-canonize"
  | "personal-agent";

type VisibleEntitlementReason = Exclude<EntitlementReason, "DEV_OVERRIDE">;

interface LockedFeatureCopy {
  readonly body: ReactNode;
  readonly eyebrow: string;
  readonly title: string;
}

interface LockedFeatureCardProps
  extends Omit<ComponentPropsWithoutRef<"section">, "title"> {
  readonly action?: ReactNode;
  readonly body?: ReactNode;
  readonly feature?: LockedFeatureKind;
  readonly preview?: ReactNode;
  readonly previewLabel?: string;
  readonly reason?: ReactNode;
  readonly reasonCode?: EntitlementReason;
  readonly title?: ReactNode;
}

interface UpgradeSurfaceProps
  extends Omit<ComponentPropsWithoutRef<"section">, "title"> {
  readonly title?: ReactNode;
}

function lockedFeatureCopy(
  feature: LockedFeatureKind,
  reason: VisibleEntitlementReason,
): LockedFeatureCopy {
  if (reason === "CAP_EXCEEDED") {
    return {
      body: "The weekly premium generation budget is spent. The archive, records, betting, and reading surfaces stay open.",
      eyebrow: "Weekly limit reached",
      title: "The cast pauses until the next window",
    };
  }

  if (reason === "EXPIRED") {
    return {
      body: "Premium access expired. Your league history, records, and existing reading surfaces stay intact.",
      eyebrow: "Expired",
      title: "Reactivate premium access",
    };
  }

  if (reason === "SUSPENDED") {
    return {
      body: "Premium access is paused. The underlying league data remains available while access is reviewed.",
      eyebrow: "Suspended",
      title: "Reactivate premium access",
    };
  }

  if (reason === "ENTITLED") {
    return {
      body: "This feature is available.",
      eyebrow: "Entitled",
      title: "Feature available",
    };
  }

  switch (feature) {
    case "arena-advanced":
      return {
        body: "Base arena ladders stay free. Premium unlocks the rivalry console, aggregate race charts, and advanced movement framing.",
        eyebrow: "Premium league",
        title: "Unlock advanced arena framing",
      };
    case "league-cast":
      return {
        body: "Standings, history, records, betting, and reading stay open. Premium turns on the league-wide cast, cadence, instigations, and AI-authored spectacle.",
        eyebrow: "Premium league",
        title: "Unlock the cast for your league",
      };
    case "lore-canonize":
      return {
        body: "Members can still view, submit, and vote on lore. Premium lets the cast canonize verdicts and turn them into league mythology.",
        eyebrow: "Premium league",
        title: "Unlock cast-driven canon",
      };
    case "personal-agent":
      return {
        body: "Get your personal agent for cross-league briefings about your teams without unlocking the full cast for every league.",
        eyebrow: "Individual tier required",
        title: "Get your personal agent",
      };
    case "generic":
      return {
        body: "The underlying product surface remains available. Premium unlocks this spectacle layer.",
        eyebrow: "Premium feature",
        title: "Unlock this feature",
      };
  }
}

function LockedFeatureCard({
  action,
  body,
  className,
  feature = "generic",
  preview,
  previewLabel = "A dimmed feature preview is shown behind the locked-state message.",
  reason,
  reasonCode = "TIER_REQUIRED",
  title,
  ...props
}: LockedFeatureCardProps) {
  const visibleReason: VisibleEntitlementReason =
    reasonCode === "DEV_OVERRIDE" ? "ENTITLED" : reasonCode;
  const copy = lockedFeatureCopy(feature, visibleReason);
  const resolvedReason = reason ?? copy.eyebrow;
  const resolvedTitle = title ?? copy.title;
  const resolvedBody = body ?? copy.body;

  return (
    <section
      aria-label={
        typeof resolvedTitle === "string" ? resolvedTitle : props["aria-label"]
      }
      className={cn(
        "panel relative grid gap-4 overflow-hidden border-warning/50 p-4 shadow-[0_0_24px_-8px_var(--glow-amber),var(--bevel)]",
        className,
      )}
      data-feature={feature}
      data-reason={reasonCode}
      data-slot="locked-feature-card"
      {...props}
    >
      {preview ? (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-25 blur-[1px] saturate-50"
            data-slot="locked-feature-preview"
            inert={true}
          >
            {preview}
          </div>
          <p className="sr-only">{previewLabel}</p>
        </>
      ) : null}
      <div className="relative z-10 flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "orb orb-md muted grid shrink-0 place-items-center text-warning",
            feature === "league-cast" && "text-primary",
          )}
        >
          <LockKeyhole className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          {resolvedReason ? (
            <p className="eyebrow text-warning">{resolvedReason}</p>
          ) : null}
          <h2 className="font-display text-base font-semibold text-foreground">
            {resolvedTitle}
          </h2>
          <div className="mt-2 text-sm leading-6 text-muted-foreground">
            {resolvedBody}
          </div>
        </div>
      </div>
      {visibleReason === "CAP_EXCEEDED" ? (
        <Banner tone="info" title="Weekly limit reached">
          No data is blocked. The cast resumes automatically when the weekly
          window resets.
        </Banner>
      ) : null}
      {action ? (
        <div className="relative z-10 w-full max-sm:[&_a]:w-full max-sm:[&_button]:w-full sm:w-fit">
          {action}
        </div>
      ) : null}
    </section>
  );
}

function UpgradeSurface({
  children,
  className,
  title = "Upgrade options",
  ...props
}: UpgradeSurfaceProps) {
  return (
    <section
      aria-label={typeof title === "string" ? title : props["aria-label"]}
      className={cn("panel grid gap-4 p-4", className)}
      data-slot="upgrade-surface"
      {...props}
    >
      <div>
        <p className="eyebrow text-warning">Entitlements</p>
        <h2 className="heading-auspex mt-1 text-lg leading-tight">{title}</h2>
        {children ? (
          <div className="mt-2 text-sm text-muted-foreground">{children}</div>
        ) : null}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <article className="cell grid gap-2 p-3">
          <span className="chip-glyph grid size-9 place-items-center text-[var(--steel-soft)]">
            <CircleGauge className="size-4" aria-hidden="true" />
          </span>
          <h3 className="font-display text-sm font-semibold">Free league</h3>
          <p className="text-sm text-muted-foreground">
            Provider connect, full history, records, league reading, lore
            viewing, and base paper betting.
          </p>
        </article>
        <article className="cell grid gap-2 border-warning/40 bg-warning/10 p-3">
          <span className="chip-glyph grid size-9 place-items-center text-warning">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          <h3 className="font-display text-sm font-semibold">Premium league</h3>
          <p className="text-sm text-muted-foreground">
            League-wide cast generation, cadence, instigations, cast-driven lore
            canon, and premium spectacle surfaces.
          </p>
        </article>
        <article className="cell grid gap-2 p-3">
          <span className="chip-glyph grid size-9 place-items-center text-primary">
            <Bot className="size-4" aria-hidden="true" />
          </span>
          <h3 className="font-display text-sm font-semibold">Individual</h3>
          <p className="text-sm text-muted-foreground">
            A personal agent for your teams across leagues, independent of a
            league-wide premium cast entitlement.
          </p>
        </article>
      </div>
    </section>
  );
}

export { LockedFeatureCard, UpgradeSurface };
export type { LockedFeatureCardProps, LockedFeatureKind, UpgradeSurfaceProps };
