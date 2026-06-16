import {
  ArrowLeft,
  ExternalLink,
  Landmark,
  Newspaper,
  Tag,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
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

function estimatedReadMinutes(body: string, fallback: string): number {
  const text = `${body} ${fallback}`.trim();
  if (!text) {
    return 1;
  }
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 225));
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

export function EditorialProse({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "prose-auspex grid gap-4",
        "[&_a]:text-primary [&_a]:underline-offset-4 [&_a:hover]:underline",
        "[&_strong]:font-semibold [&_strong]:text-foreground",
        className,
      )}
      data-slot="editorial-prose"
      {...props}
    />
  );
}

function renderBodyBlock(block: BodyBlock, index: number) {
  switch (block.type) {
    case "heading":
      return (
        <h2
          key={`${index}-${block.text}`}
          className="heading-auspex h-grad pt-4 text-xl leading-snug"
        >
          {block.text}
        </h2>
      );
    case "quote":
      return (
        <figure
          key={`${index}-${block.text}`}
          className="my-2 border-l-2 border-primary/80 bg-primary/5 py-3 pl-4 pr-3"
        >
          <blockquote className="font-display text-xl font-medium leading-8 text-foreground">
            {block.text}
          </blockquote>
        </figure>
      );
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List
          key={`${index}-${block.items.join("|")}`}
          className={cn(
            "grid gap-2 pl-5",
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
      return <p key={`${index}-${block.text}`}>{block.text}</p>;
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
  const readMinutes = estimatedReadMinutes(data.article.body, data.article.dek);
  const isCastArticle = data.article.kind === "blog";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-8 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
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

      <article className="grid gap-6" data-slot="publication-article">
        <header className="panel mx-auto grid w-full max-w-[76ch] gap-5 p-4 sm:p-6">
          <Link
            href={data.article.section.href}
            className="eyebrow w-fit text-primary underline-offset-4 hover:underline"
          >
            {data.article.section.label}
          </Link>
          <h1 className="heading-auspex h-grad text-3xl leading-tight sm:text-4xl">
            {data.article.headline}
          </h1>
          {data.article.dek ? (
            <p className="max-w-[62ch] font-body text-lg leading-8 text-muted-foreground sm:text-xl">
              {data.article.dek}
            </p>
          ) : null}
          <div
            className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground"
            data-article-origin={isCastArticle ? "cast" : "source"}
          >
            {isCastArticle ? (
              <span
                aria-hidden="true"
                className="orb orb-md"
                data-slot="article-byline-orb"
              />
            ) : null}
            <div className="grid min-w-0 gap-0.5">
              <p className="font-display text-sm font-semibold text-foreground">
                {data.article.byline}
              </p>
              {data.article.bylineDetail ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  {data.article.bylineDetail}
                </p>
              ) : null}
            </div>
            <span aria-hidden="true" className="text-muted-foreground">
              |
            </span>
            <time
              className="metric text-xs"
              dateTime={data.article.publishedAt}
            >
              {formatPublishedAt(data.article.publishedAt)}
            </time>
            <span className="metric rounded-control border border-input bg-[var(--panel-2)] px-2 py-1 text-xs text-muted-foreground">
              {readMinutes} min read
            </span>
          </div>
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
              <span className="sr-only"> opens in new tab</span>
            </a>
          ) : null}
        </header>

        {data.article.heroImageUrl ? (
          <div className="panel mx-auto w-full max-w-5xl overflow-hidden p-2">
            <Image
              src={data.article.heroImageUrl}
              alt=""
              width={1280}
              height={720}
              unoptimized
              className="aspect-[16/9] w-full rounded-control border border-[var(--hair)] object-cover"
            />
          </div>
        ) : null}

        <section
          aria-label="Article body"
          className="panel mx-auto w-full max-w-[72ch] p-4 sm:p-6"
        >
          <EditorialProse>
            {bodyBlocks.length > 0 ? (
              bodyBlocks.map(renderBodyBlock)
            ) : (
              <p className="cell border-dashed px-3 py-3 text-sm text-muted-foreground">
                This article does not have body text yet.
              </p>
            )}
          </EditorialProse>
        </section>

        {data.article.canonCitations.length > 0 ? (
          <aside
            aria-label="Cited canon"
            className="panel mx-auto grid w-full max-w-[72ch] gap-3 border-primary/35 p-4"
          >
            <div>
              <p className="flex items-center gap-2 font-display text-sm font-semibold">
                <Landmark className="size-4 text-primary" aria-hidden="true" />
                Cited canon
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Settled league lore referenced by this article.
              </p>
            </div>
            <div className="grid gap-2">
              {data.article.canonCitations.map((citation) => (
                <section key={citation.claimId} className="cell px-3 py-2">
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
                </section>
              ))}
            </div>
          </aside>
        ) : null}

        {data.article.tags.length > 0 ? (
          <nav
            aria-label="Article tags"
            className="mx-auto flex w-full max-w-[72ch] flex-wrap gap-2"
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
      </article>

      {data.relatedStories.length > 0 ? (
        <section className="grid gap-3" aria-label="Related stories">
          <div>
            <p className="eyebrow text-primary">Keep reading</p>
            <h2 className="heading-auspex h-grad mt-1 text-base">
              Related stories
            </h2>
          </div>
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
