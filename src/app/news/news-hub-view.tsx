import { ArrowLeft, Newspaper } from "lucide-react";
import Link from "next/link";
import {
  type PublicationStory,
  PublicationStoryCard,
} from "@/components/publication/story-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildPublicationFront } from "@/news/front";
import type { CentralNewsHubData } from "@/news/hub";
import { CentralNewsRealtimeRefresh } from "@/realtime/client";

function toStory(item: CentralNewsHubData["items"][number]): PublicationStory {
  return {
    byline: item.source,
    dek: item.dek ?? item.summary,
    headline: item.title,
    href: `/news/articles/${item.id}`,
    hrefLabel: "Read story",
    id: item.id,
    publishedAt: item.publishedAt,
    sectionTag: item.section.label,
    sourceUrl: item.sourceUrl,
    thumbnailAlt: item.title,
    thumbnailUrl: item.thumbnailUrl,
  };
}

function toRailStory(
  item: NonNullable<CentralNewsHubData["forYourLeague"]>["items"][number],
): PublicationStory {
  return {
    byline: item.source,
    dek: item.dek ?? item.summary,
    headline: item.title,
    href: `/news/articles/${item.contentItemId}`,
    hrefLabel: "Read story",
    id: item.id,
    publishedAt: item.publishedAt,
    relevanceReason: item.relevanceReason,
    sectionTag: item.section.label,
    sourceUrl: item.sourceUrl,
    thumbnailAlt: item.title,
    thumbnailUrl: item.thumbnailUrl,
  };
}

function newsHref(path: string, leagueId: string | null | undefined): string {
  if (!leagueId) {
    return path;
  }

  return `${path}?leagueId=${encodeURIComponent(leagueId)}`;
}

export function NewsHubView({ data }: { data: CentralNewsHubData }) {
  const front = buildPublicationFront(data.items);
  const rail = data.forYourLeague;
  const heading = data.activeSection
    ? `${data.activeSection.label} stories`
    : "NFL and fantasy headlines";
  const filteredHeading = data.activeTag
    ? `${heading} tagged ${data.activeTag}`
    : heading;
  const emptyTitle = data.activeSection
    ? `No ${data.activeSection.label} stories yet`
    : "No central stories yet";
  const filteredEmptyTitle = data.activeTag
    ? `No stories tagged ${data.activeTag}`
    : emptyTitle;
  const emptyBody = data.activeSection
    ? "This section has no published stories yet. The rest of Rumbledore News is still available."
    : "The news refresh job has not published any shared headlines.";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <CentralNewsRealtimeRefresh />
      <header className="grid gap-4">
        <Link
          href="/"
          className={cn(
            buttonVariants({ className: "w-fit", variant: "ghost" }),
          )}
        >
          <ArrowLeft data-icon="inline-start" />
          Home
        </Link>
        <div className="grid gap-3">
          <div className="flex items-center gap-2 text-primary">
            <Newspaper className="size-5" aria-hidden="true" />
            <p className="text-sm font-medium">Central news</p>
          </div>
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-muted-foreground">
              {data.activeSection
                ? "Rumbledore News section"
                : "Rumbledore News"}
            </p>
            <h1 className="mt-1 text-xl font-semibold sm:text-2xl">
              {filteredHeading}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Shared central news from the sport's feed. League-specific context
              appears only as a narrow rail when a league is active.
            </p>
          </div>
          <nav aria-label="News sections" className="flex flex-wrap gap-2">
            <Link
              href={newsHref("/news", rail?.league.id)}
              aria-current={data.activeSection ? undefined : "page"}
              className={cn(
                buttonVariants({
                  className: "w-fit",
                  size: "sm",
                  variant: data.activeSection ? "outline" : "default",
                }),
              )}
            >
              Front
            </Link>
            {data.sections.map((section) => (
              <Link
                key={section.id}
                href={newsHref(`/news/${section.slug}`, rail?.league.id)}
                aria-current={
                  data.activeSection?.id === section.id ? "page" : undefined
                }
                className={cn(
                  buttonVariants({
                    className: "w-fit",
                    size: "sm",
                    variant:
                      data.activeSection?.id === section.id
                        ? "default"
                        : "outline",
                  }),
                )}
              >
                {section.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {rail ? (
        <section aria-label="For your league" className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-primary uppercase">
                For your league
              </p>
              <h2 className="text-base font-semibold">
                Central stories touching {rail.league.name}
              </h2>
            </div>
            <Link
              href={`/leagues/${rail.league.id}/press`}
              className={cn(
                buttonVariants({
                  className: "w-fit",
                  size: "sm",
                  variant: "outline",
                }),
              )}
            >
              Read The Press
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {rail.items.map((item) => (
              <PublicationStoryCard
                key={item.id}
                story={toRailStory(item)}
                variant="rail"
              />
            ))}
          </div>
        </section>
      ) : null}

      {front.lead ? (
        <div className="grid gap-5">
          <section aria-label="Lead story" data-front-tier="lead">
            <PublicationStoryCard story={toStory(front.lead)} variant="hero" />
          </section>
          {front.secondaries.length > 0 ? (
            <section
              className="grid gap-3 md:grid-cols-3"
              aria-label="Secondary stories"
              data-front-tier="secondary"
            >
              {front.secondaries.map((item) => (
                <PublicationStoryCard
                  key={item.id}
                  story={toStory(item)}
                  variant="secondary"
                />
              ))}
            </section>
          ) : null}
          {front.river.length > 0 ? (
            <section
              className="grid gap-3 sm:grid-cols-2"
              aria-label="Story river"
              data-front-tier="river"
            >
              {front.river.map((item) => (
                <PublicationStoryCard
                  key={item.id}
                  story={toStory(item)}
                  variant="river"
                />
              ))}
            </section>
          ) : null}
        </div>
      ) : (
        <section className="rounded-card border border-dashed border-border bg-muted/25 p-4">
          <h2 className="text-base font-semibold">{filteredEmptyTitle}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{emptyBody}</p>
        </section>
      )}
    </main>
  );
}
