import { ArrowLeft, ExternalLink, Newspaper, Rss } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LeagueFeedData, LeagueFeedItem } from "@/news";

function formatPublishedAt(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

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

function FeedCard({ item }: { item: LeagueFeedItem }) {
  const hasSource = item.scope === "central" && item.sourceUrl.length > 0;
  const Icon = item.scope === "central" ? Newspaper : Rss;

  return (
    <article className="rounded-card border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-primary">
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 truncate text-xs font-medium">
            {sourceLabel(item)}
          </p>
        </div>
        <time
          className="shrink-0 text-xs text-muted-foreground"
          dateTime={item.publishedAt}
        >
          {formatPublishedAt(item.publishedAt)}
        </time>
      </div>
      <h2 className="text-base font-semibold tracking-tight">{item.title}</h2>
      {item.summary ? (
        <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
          {item.summary}
        </p>
      ) : null}
      {item.relevanceReason ? (
        <p className="mt-3 rounded-control border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {item.relevanceReason}
        </p>
      ) : null}
      {hasSource ? (
        <a
          href={item.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className={cn(
            buttonVariants({
              className: "mt-4 w-fit",
              size: "sm",
              variant: "outline",
            }),
          )}
        >
          Read source
          <ExternalLink data-icon="inline-end" />
        </a>
      ) : null}
    </article>
  );
}

export function LeagueFeedView({ data }: { data: LeagueFeedData }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
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
            <p className="text-sm font-medium">League feed</p>
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {data.league.name}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {data.league.season} ESPN fantasy football ·{" "}
              {data.userRole.replace("_", " ")}
            </p>
          </div>
        </div>
      </header>

      {data.items.length > 0 ? (
        <section
          className="grid gap-3 sm:grid-cols-2"
          aria-label="League feed items"
        >
          {data.items.map((item) => (
            <FeedCard key={`${item.scope}-${item.id}`} item={item} />
          ))}
        </section>
      ) : (
        <section className="rounded-card border border-dashed border-border bg-muted/25 p-4">
          <h2 className="text-base font-semibold tracking-tight">
            No league feed items yet
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            League posts and matched central stories will appear here after
            publishing.
          </p>
        </section>
      )}
    </main>
  );
}
