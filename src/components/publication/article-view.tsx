import {
  ArrowLeft,
  ExternalLink,
  Landmark,
  Newspaper,
  Tag,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { PublicationArticleViewData } from "@/news/article";
import { buttonVariants } from "../ui/button";
import { PublicationStoryCard } from "./story-card";

type BodyBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "list"; ordered: boolean; items: string[] };

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

function cleanLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parseBodyBlock(block: string): BodyBlock | null {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return null;
  }

  if (lines.length === 1) {
    const heading = lines[0]?.match(/^#{1,3}\s+(.+)$/);
    if (heading?.[1]) {
      return { text: cleanLine(heading[1]), type: "heading" };
    }
  }

  if (lines.every((line) => line.startsWith(">"))) {
    return {
      text: cleanLine(lines.map((line) => line.replace(/^>\s?/, "")).join(" ")),
      type: "quote",
    };
  }

  if (lines.every((line) => /^[-*]\s+/.test(line))) {
    return {
      items: lines.map((line) => cleanLine(line.replace(/^[-*]\s+/, ""))),
      ordered: false,
      type: "list",
    };
  }

  if (lines.every((line) => /^\d+[.)]\s+/.test(line))) {
    return {
      items: lines.map((line) => cleanLine(line.replace(/^\d+[.)]\s+/, ""))),
      ordered: true,
      type: "list",
    };
  }

  return { text: cleanLine(lines.join(" ")), type: "paragraph" };
}

export function parseArticleBodyBlocks(
  body: string,
  fallback: string,
): BodyBlock[] {
  const text = body.trim().length > 0 ? body : fallback;
  return text
    .split(/\n{2,}/)
    .map(parseBodyBlock)
    .filter((block): block is BodyBlock => block !== null);
}

function tagHref(baseHref: string, tag: string): string {
  const params = new URLSearchParams({ tag });
  return `${baseHref}?${params.toString()}`;
}

function canonCitationProvenanceLabel(
  citation: PublicationArticleViewData["article"]["canonCitations"][number],
): string {
  const provenance =
    citation.provenance === "verified"
      ? "verified"
      : citation.provenance === "steward"
        ? "steward ratified"
        : "league decided";
  return citation.ratifiedAt
    ? `Canon - ${provenance} - ${formatPublishedAt(citation.ratifiedAt)}`
    : `Canon - ${provenance}`;
}

function renderBodyBlock(block: BodyBlock, index: number) {
  switch (block.type) {
    case "heading":
      return (
        <h2
          key={`${index}-${block.text}`}
          className="pt-3 text-xl font-semibold leading-snug"
        >
          {block.text}
        </h2>
      );
    case "quote":
      return (
        <blockquote
          key={`${index}-${block.text}`}
          className="border-l-2 border-primary pl-4 text-lg font-medium leading-8 text-foreground"
        >
          {block.text}
        </blockquote>
      );
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List
          key={`${index}-${block.items.join("|")}`}
          className={cn(
            "grid gap-2 pl-5 text-base leading-7",
            block.ordered ? "list-decimal" : "list-disc",
          )}
        >
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </List>
      );
    }
    case "paragraph":
      return (
        <p key={`${index}-${block.text}`} className="text-base leading-8">
          {block.text}
        </p>
      );
  }
}

export function PublicationArticleView({
  data,
}: {
  data: PublicationArticleViewData;
}) {
  const bodyBlocks = parseArticleBodyBlocks(
    data.article.body,
    data.article.dek,
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-8 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="grid gap-5">
        <div className="flex flex-wrap gap-2">
          <Link
            href={data.backHref}
            className={cn(
              buttonVariants({ className: "w-fit", variant: "ghost" }),
            )}
          >
            <ArrowLeft data-icon="inline-start" />
            {data.backLabel}
          </Link>
          <Link
            href={data.publicationHref}
            className={cn(
              buttonVariants({ className: "w-fit", variant: "outline" }),
            )}
          >
            <Newspaper data-icon="inline-start" />
            {data.publicationLabel}
          </Link>
        </div>

        <div className="max-w-3xl">
          <Link
            href={data.article.section.href}
            className="text-sm font-medium text-primary"
          >
            {data.article.section.label}
          </Link>
          <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
            {data.article.headline}
          </h1>
          {data.article.dek ? (
            <p className="mt-4 text-lg leading-8 text-muted-foreground">
              {data.article.dek}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {data.article.byline}
            </span>
            <span aria-hidden="true">|</span>
            <time dateTime={data.article.publishedAt}>
              {formatPublishedAt(data.article.publishedAt)}
            </time>
          </div>
          {data.article.bylineDetail ? (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {data.article.bylineDetail}
            </p>
          ) : null}
          {data.article.sourceUrl ? (
            <a
              href={data.article.sourceUrl}
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
              Open source
              <ExternalLink data-icon="inline-end" />
            </a>
          ) : null}
        </div>
      </header>

      {data.article.heroImageUrl ? (
        <Image
          src={data.article.heroImageUrl}
          alt=""
          width={1280}
          height={720}
          unoptimized
          className="aspect-[16/9] w-full rounded-card border border-border object-cover"
        />
      ) : null}

      <article className="grid max-w-3xl gap-5 text-foreground">
        {bodyBlocks.length > 0 ? (
          bodyBlocks.map(renderBodyBlock)
        ) : (
          <p className="rounded-control border border-dashed border-border bg-muted/25 px-3 py-3 text-sm text-muted-foreground">
            This article does not have body text yet.
          </p>
        )}
      </article>

      {data.article.canonCitations.length > 0 ? (
        <aside
          aria-label="Cited canon"
          className="grid max-w-3xl gap-3 rounded-card border border-border bg-card p-4"
        >
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Landmark className="size-4 text-primary" aria-hidden="true" />
              Cited canon
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Settled league lore referenced by this article.
            </p>
          </div>
          <div className="grid gap-2">
            {data.article.canonCitations.map((citation) => (
              <article
                key={citation.claimId}
                className="rounded-control border border-border bg-muted/20 px-3 py-2"
              >
                <Link
                  href={citation.href}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline"
                >
                  <Landmark className="size-4" aria-hidden="true" />
                  {citation.title}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  {canonCitationProvenanceLabel(citation)}
                </p>
              </article>
            ))}
          </div>
        </aside>
      ) : null}

      {data.article.tags.length > 0 ? (
        <nav
          aria-label="Article tags"
          className="flex max-w-3xl flex-wrap gap-2"
        >
          {data.article.tags.map((tag) => (
            <Link
              key={tag}
              href={tagHref(data.tagHrefBase, tag)}
              className={cn(
                buttonVariants({
                  className: "w-fit",
                  size: "sm",
                  variant: "outline",
                }),
              )}
            >
              <Tag data-icon="inline-start" />
              {tag}
            </Link>
          ))}
        </nav>
      ) : null}

      {data.relatedStories.length > 0 ? (
        <section className="grid gap-3" aria-label="Related stories">
          <h2 className="text-base font-semibold">Related stories</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.relatedStories.map((story) => (
              <PublicationStoryCard
                key={story.id}
                story={story}
                variant="rail"
              />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
