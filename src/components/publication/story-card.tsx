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
      return "rounded-card border border-border bg-card p-5 sm:p-6";
    case "secondary":
      return "rounded-card border border-border bg-card p-4";
    case "rail":
      return "rounded-card border border-border bg-card p-3";
    case "river":
      return "rounded-card border border-border bg-card p-4";
  }
}

function headlineClassName(variant: PublicationStoryCardVariant): string {
  switch (variant) {
    case "hero":
      return "text-2xl font-semibold leading-tight sm:text-3xl";
    case "secondary":
      return "text-lg font-semibold leading-snug";
    case "rail":
      return "text-sm font-semibold leading-snug";
    case "river":
      return "text-base font-semibold leading-snug";
  }
}

function dekClassName(variant: PublicationStoryCardVariant): string {
  switch (variant) {
    case "hero":
      return "mt-3 line-clamp-4 text-base leading-7 text-muted-foreground";
    case "secondary":
      return "mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground";
    case "rail":
      return "mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground";
    case "river":
      return "mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground";
  }
}

function thumbnailClassName(variant: PublicationStoryCardVariant): string {
  switch (variant) {
    case "hero":
      return "mb-4 aspect-[16/9] w-full rounded-control border border-border object-cover";
    case "secondary":
    case "river":
      return "mb-3 aspect-[16/9] w-full rounded-control border border-border object-cover";
    case "rail":
      return "mb-3 aspect-[5/3] w-full rounded-control border border-border object-cover";
  }
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
      data-story-card-variant={variant}
    >
      {story.thumbnailUrl ? (
        <Image
          src={story.thumbnailUrl}
          alt={story.thumbnailAlt ?? ""}
          width={960}
          height={540}
          unoptimized
          className={thumbnailClassName(variant)}
        />
      ) : null}
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-xs font-medium text-primary">
          {story.sectionTag}
        </p>
        <time
          className="shrink-0 text-xs text-muted-foreground"
          dateTime={story.publishedAt}
        >
          {formatPublishedAt(story.publishedAt)}
        </time>
      </div>
      <h2 className={headlineClassName(variant)}>{story.headline}</h2>
      <p className="mt-2 text-xs font-medium text-muted-foreground">
        {story.byline}
      </p>
      {story.dek ? <p className={dekClassName(variant)}>{story.dek}</p> : null}
      {story.relevanceReason ? (
        <p className="mt-3 rounded-control border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
          {story.relevanceReason}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
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
          </a>
        ) : null}
      </div>
    </article>
  );
}
