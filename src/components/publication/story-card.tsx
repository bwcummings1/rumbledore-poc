import { ArrowRight, ExternalLink } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PublicationStory, PublicationStoryCardVariant } from "./story";

export type { PublicationStory, PublicationStoryCardVariant } from "./story";

function formatPublishedAt(value: string): string {
  const publishedAt = new Date(value).getTime();
  if (!Number.isFinite(publishedAt)) {
    return "recently";
  }

  const diffMs = publishedAt - Date.now();
  const absMs = Math.abs(diffMs);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const weekMs = 7 * dayMs;
  const formatter = new Intl.RelativeTimeFormat("en-US", {
    numeric: "auto",
  });

  if (absMs < minuteMs) {
    return "now";
  }
  if (absMs < hourMs) {
    return formatter.format(Math.round(diffMs / minuteMs), "minute");
  }
  if (absMs < dayMs) {
    return formatter.format(Math.round(diffMs / hourMs), "hour");
  }
  if (absMs < weekMs) {
    return formatter.format(Math.round(diffMs / dayMs), "day");
  }
  return formatter.format(Math.round(diffMs / weekMs), "week");
}

function cardClassName(variant: PublicationStoryCardVariant): string {
  switch (variant) {
    case "hero":
      return "panel group/story relative grid gap-4 overflow-hidden p-4 transition motion-safe:hover:-translate-y-0.5 hover:border-[var(--hair-3)] hover:shadow-[0_0_30px_-18px_var(--glow-lilac),var(--glass-shadow),var(--bevel)] motion-reduce:transition-none sm:p-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,.92fr)] lg:items-stretch";
    case "secondary":
      return "panel group/story grid gap-3 p-4 transition motion-safe:hover:-translate-y-0.5 hover:border-[var(--hair-3)] hover:shadow-raised motion-reduce:transition-none";
    case "rail":
      return "cell group/story grid gap-2 p-3 transition-colors hover:border-[var(--hair-3)] hover:bg-elevated/60";
    case "compact":
      return "group/story grid gap-2 border-b border-[var(--hair)] py-3 last:border-b-0";
    case "inFeed":
      return "cell group/story grid gap-3 p-3 shadow-[0_0_22px_-18px_var(--glow-lilac),var(--bevel)] transition-colors hover:border-[var(--hair-3)] hover:bg-elevated/60";
    case "river":
      return "panel group/story grid gap-3 p-4 transition motion-safe:hover:-translate-y-0.5 hover:border-[var(--hair-3)] hover:shadow-raised motion-reduce:transition-none";
  }
}

function headlineClassName(variant: PublicationStoryCardVariant): string {
  switch (variant) {
    case "hero":
      return "heading-auspex h-grad line-clamp-4 text-2xl leading-tight sm:text-3xl";
    case "secondary":
      return "heading-auspex h-grad line-clamp-3 text-lg leading-snug";
    case "rail":
      return "line-clamp-2 font-display text-sm font-semibold leading-snug text-foreground";
    case "compact":
      return "line-clamp-2 font-display text-sm font-semibold leading-snug text-foreground sm:text-base";
    case "inFeed":
      return "line-clamp-2 font-display text-base font-semibold leading-snug text-foreground";
    case "river":
      return "line-clamp-2 font-display text-base font-semibold leading-snug text-foreground";
  }
}

function dekClassName(variant: PublicationStoryCardVariant): string {
  switch (variant) {
    case "hero":
      return "line-clamp-4 text-base leading-7 text-muted-foreground";
    case "secondary":
      return "line-clamp-3 text-sm leading-6 text-muted-foreground";
    case "rail":
      return "line-clamp-2 text-xs leading-5 text-muted-foreground";
    case "compact":
      return "line-clamp-2 text-xs leading-5 text-muted-foreground";
    case "inFeed":
      return "line-clamp-2 text-sm leading-6 text-muted-foreground";
    case "river":
      return "line-clamp-3 text-sm leading-6 text-muted-foreground";
  }
}

function thumbnailClassName(variant: PublicationStoryCardVariant): string {
  switch (variant) {
    case "hero":
      return "aspect-[16/9] w-full rounded-control border border-[var(--hair)] object-cover shadow-[var(--bevel)] lg:h-full";
    case "secondary":
    case "river":
      return "aspect-[16/9] w-full rounded-control border border-[var(--hair)] object-cover shadow-[var(--bevel)]";
    case "rail":
      return "aspect-[5/3] w-full rounded-control border border-[var(--hair)] object-cover shadow-[var(--bevel)]";
    case "compact":
      return "hidden";
    case "inFeed":
      return "aspect-[16/9] w-full rounded-control border border-[var(--hair)] object-cover shadow-[var(--bevel)] sm:hidden";
  }
}

function showsThumbnail(variant: PublicationStoryCardVariant): boolean {
  return variant !== "compact";
}

function Byline({
  origin,
  value,
  variant,
}: {
  origin: PublicationStory["origin"];
  value: string;
  variant: PublicationStoryCardVariant;
}) {
  const isCast = origin === "cast";
  return (
    <p
      className={cn(
        "flex min-w-0 items-center gap-2 text-muted-foreground",
        variant === "hero" ? "text-sm" : "text-xs",
      )}
    >
      {isCast ? (
        <span
          aria-hidden="true"
          className={cn("orb", variant === "hero" ? "orb-sm" : "orb-xs")}
          data-slot="story-card-orb"
        />
      ) : null}
      <span className="min-w-0 truncate font-medium text-foreground">
        {value}
      </span>
      {isCast ? (
        <span className="eyebrow min-w-fit text-primary">AI cast</span>
      ) : null}
    </p>
  );
}

export function PublicationStoryCard({
  story,
  variant,
}: {
  story: PublicationStory;
  variant: PublicationStoryCardVariant;
}) {
  const hasInternalHref = story.href && story.href.length > 0;
  const hasSourceUrl = story.sourceUrl && story.sourceUrl.length > 0;

  return (
    <article
      className={cardClassName(variant)}
      data-story-card-origin={story.origin ?? "source"}
      data-story-card-variant={variant}
    >
      {story.thumbnailUrl && showsThumbnail(variant) ? (
        <Image
          src={story.thumbnailUrl}
          alt={story.thumbnailAlt ?? ""}
          width={960}
          height={540}
          unoptimized
          className={thumbnailClassName(variant)}
        />
      ) : null}
      <div className="grid min-w-0 gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow min-w-0 truncate text-primary">
            {story.sectionTag}
          </p>
          <time
            className="metric shrink-0 text-xs text-muted-foreground"
            dateTime={story.publishedAt}
          >
            {formatPublishedAt(story.publishedAt)}
          </time>
        </div>
        <h2 className={headlineClassName(variant)}>{story.headline}</h2>
        <Byline origin={story.origin} value={story.byline} variant={variant} />
        {story.dek ? (
          <p className={dekClassName(variant)}>{story.dek}</p>
        ) : null}
        {story.relevanceReason ? (
          <p className="border-l-2 border-primary/70 bg-primary/5 px-3 py-2 text-xs leading-5 text-muted-foreground">
            {story.relevanceReason}
          </p>
        ) : null}
        {story.thumbnailUrl && variant === "compact" ? (
          <p className="sr-only">
            Image available: {story.thumbnailAlt ?? story.headline}
          </p>
        ) : null}
        <div
          className={cn(
            "flex flex-wrap gap-2",
            variant === "compact" && "mt-1",
          )}
        >
          {hasInternalHref ? (
            <Link
              href={story.href ?? ""}
              className={cn(
                buttonVariants({
                  className: "w-fit",
                  size: "sm",
                  variant: variant === "hero" ? "default" : "outline",
                }),
              )}
            >
              {story.hrefLabel ?? "Read story"}
              <ArrowRight data-icon="inline-end" />
            </Link>
          ) : null}
          {hasSourceUrl ? (
            <a
              href={story.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(
                buttonVariants({
                  className: "w-fit",
                  size: "sm",
                  variant: "outline",
                }),
              )}
            >
              Read source
              <ExternalLink data-icon="inline-end" />
              <span className="sr-only"> opens in new tab</span>
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
