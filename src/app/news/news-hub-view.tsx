import { ArrowLeft, ExternalLink, Newspaper } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CentralNewsHubData } from "@/news/hub";
import { CentralNewsRealtimeRefresh } from "@/realtime/client";

function formatPublishedAt(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function NewsCard({ item }: { item: CentralNewsHubData["items"][number] }) {
  const hasLink = item.sourceUrl.length > 0;

  return (
    <article className="rounded-card border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-xs font-medium text-primary">
          {item.source}
        </p>
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
      {hasLink ? (
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

export function NewsHubView({ data }: { data: CentralNewsHubData }) {
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
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              NFL and fantasy headlines
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Shared league-agnostic news from the central feed. League-specific
              framing stays in each league's Press.
            </p>
          </div>
        </div>
      </header>

      {data.items.length > 0 ? (
        <section
          className="grid gap-3 sm:grid-cols-2"
          aria-label="News stories"
        >
          {data.items.map((item) => (
            <NewsCard key={item.id} item={item} />
          ))}
        </section>
      ) : (
        <section className="rounded-card border border-dashed border-border bg-muted/25 p-4">
          <h2 className="text-base font-semibold tracking-tight">
            No central stories yet
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The news refresh job has not published any shared headlines.
          </p>
        </section>
      )}
    </main>
  );
}
