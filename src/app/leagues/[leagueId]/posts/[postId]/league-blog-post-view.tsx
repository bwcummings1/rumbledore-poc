import { ArrowLeft, BookOpenText, Rss } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LeagueBlogPostData } from "@/news";

function formatPublishedAt(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
}

function personaLabel(persona: LeagueBlogPostData["post"]["authorPersona"]) {
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

function bodyParagraphs(post: LeagueBlogPostData["post"]): string[] {
  const text = post.body.trim().length > 0 ? post.body : post.summary;
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

export function LeagueBlogPostView({ data }: { data: LeagueBlogPostData }) {
  const paragraphs = bodyParagraphs(data.post);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="grid gap-5">
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/leagues/${data.league.id}/press`}
            className={cn(
              buttonVariants({ className: "w-fit", variant: "ghost" }),
            )}
          >
            <ArrowLeft data-icon="inline-start" />
            The Press
          </Link>
          <Link
            href={`/leagues/${data.league.id}`}
            className={cn(
              buttonVariants({ className: "w-fit", variant: "outline" }),
            )}
          >
            <Rss data-icon="inline-start" />
            League home
          </Link>
        </div>
        <div className="grid gap-3">
          <div className="flex items-center gap-2 text-primary">
            <BookOpenText className="size-5" aria-hidden="true" />
            <p className="text-sm font-medium">
              {personaLabel(data.post.authorPersona)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              {data.league.name} · {data.league.season} ·{" "}
              {data.userRole.replace("_", " ")}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              {data.post.title}
            </h1>
            <time
              className="mt-3 block text-sm text-muted-foreground"
              dateTime={data.post.publishedAt}
            >
              {formatPublishedAt(data.post.publishedAt)}
            </time>
          </div>
        </div>
      </header>

      <article className="grid gap-5 rounded-card border border-border bg-card p-4 sm:p-5">
        {data.post.summary ? (
          <p className="text-base leading-7 text-muted-foreground">
            {data.post.summary}
          </p>
        ) : null}
        {paragraphs.length > 0 ? (
          <div className="grid gap-4 text-sm leading-7 text-foreground sm:text-base">
            {paragraphs.map((paragraph, index) => (
              <p key={`${index}-${paragraph}`} className="whitespace-pre-line">
                {paragraph}
              </p>
            ))}
          </div>
        ) : (
          <p className="rounded-control border border-dashed border-border bg-muted/25 px-3 py-3 text-sm text-muted-foreground">
            This post does not have body text yet.
          </p>
        )}
      </article>
    </main>
  );
}
