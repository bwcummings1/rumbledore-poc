import { ArrowLeft, Newspaper, Rss } from "lucide-react";
import Link from "next/link";
import {
  type PublicationStory,
  PublicationStoryCard,
} from "@/components/publication/story-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LeagueFeedData, LeagueFeedItem } from "@/news";
import { buildPublicationFront } from "@/news/front";
import { LeagueRealtimeRefresh } from "@/realtime/client";

function personaLabel(persona: LeagueFeedItem["authorPersona"]): string {
  switch (persona) {
    case "commissioner":
      return "Commissioner";
    case "analyst":
      return "Analyst";
    case "narrator":
      return "Narrator";
    case "trash_talker":
      return "Trash-Talker";
    case "betting_advisor":
      return "Betting-Advisor";
    case null:
      return "League blog";
  }
}

function sourceLabel(item: LeagueFeedItem): string {
  if (item.scope === "league" && item.kind === "blog") {
    return personaLabel(item.authorPersona);
  }
  return item.sourceLabel;
}

function sectionTag(item: LeagueFeedItem): string {
  return item.section.label;
}

function toStory({
  item,
  leagueId,
}: {
  item: LeagueFeedItem;
  leagueId: string;
}): PublicationStory {
  const href =
    item.scope === "league" && item.kind === "blog"
      ? `/leagues/${leagueId}/press/${item.contentItemId}`
      : item.scope === "central"
        ? `/news/articles/${item.contentItemId}`
        : undefined;

  return {
    byline: sourceLabel(item),
    dek: item.dek ?? item.summary,
    headline: item.title,
    href,
    hrefLabel:
      item.scope === "league" && item.kind === "blog"
        ? "Read post"
        : "Read story",
    id: `${item.scope}-${item.id}`,
    publishedAt: item.publishedAt,
    relevanceReason: item.relevanceReason,
    sectionTag: sectionTag(item),
    sourceUrl: item.scope === "central" ? item.sourceUrl : undefined,
    thumbnailAlt: item.title,
    thumbnailUrl: item.thumbnailUrl,
  };
}

export function LeagueFeedView({ data }: { data: LeagueFeedData }) {
  const front = buildPublicationFront(data.items);
  const heading = data.activeSection
    ? `The ${data.league.name} Press: ${data.activeSection.label}`
    : `The ${data.league.name} Press`;
  const filteredHeading = data.activeTag
    ? `${heading} tagged ${data.activeTag}`
    : heading;
  const emptyTitle = data.activeSection
    ? `No ${data.activeSection.label} stories yet`
    : "No Press items yet";
  const filteredEmptyTitle = data.activeTag
    ? `No stories tagged ${data.activeTag}`
    : emptyTitle;
  const emptyBody = data.activeSection
    ? "This beat has no league stories or matched central news yet. The full Press front is still available."
    : "League posts and matched central stories will appear here after the cast publishes.";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <LeagueRealtimeRefresh
        channelKinds={["blog"]}
        leagueId={data.league.id}
      />
      <header className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/leagues/${data.league.id}`}
            className={cn(
              buttonVariants({ className: "w-fit", variant: "ghost" }),
            )}
          >
            <ArrowLeft data-icon="inline-start" />
            League home
          </Link>
          <Link
            href="/news"
            className={cn(
              buttonVariants({ className: "w-fit", variant: "outline" }),
            )}
          >
            <Newspaper data-icon="inline-start" />
            Central news
          </Link>
        </div>
        <div className="grid gap-3">
          <div className="flex items-center gap-2 text-primary">
            <Rss className="size-5" aria-hidden="true" />
            <p className="text-sm font-medium">The Press</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              {data.activeSection
                ? "League publication section"
                : "League publication"}
            </p>
            <h1 className="mt-1 text-xl font-semibold sm:text-2xl">
              {filteredHeading}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {data.league.season} ESPN fantasy football ·{" "}
              {data.userRole.replace("_", " ")}
            </p>
          </div>
          <nav aria-label="Press sections" className="flex flex-wrap gap-2">
            <Link
              href={`/leagues/${data.league.id}/press`}
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
                href={`/leagues/${data.league.id}/press/${section.slug}`}
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

      {front.lead ? (
        <div className="grid gap-5">
          <section aria-label="Lead story" data-front-tier="lead">
            <PublicationStoryCard
              story={toStory({ item: front.lead, leagueId: data.league.id })}
              variant="hero"
            />
          </section>
          {front.secondaries.length > 0 ? (
            <section
              className="grid gap-3 md:grid-cols-3"
              aria-label="Secondary stories"
              data-front-tier="secondary"
            >
              {front.secondaries.map((item) => (
                <PublicationStoryCard
                  key={`${item.scope}-${item.id}`}
                  story={toStory({ item, leagueId: data.league.id })}
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
                  key={`${item.scope}-${item.id}`}
                  story={toStory({ item, leagueId: data.league.id })}
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
