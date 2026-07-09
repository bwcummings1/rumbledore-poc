import {
  ArrowLeft,
  ArrowRight,
  Ban,
  ExternalLink,
  Landmark,
  Newspaper,
  Tag,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import { EditLedgerFeed } from "@/components/curation/edit-ledger-feed";
import { cn } from "@/lib/utils";
import type {
  PublicationArticleBodyBlock,
  PublicationArticleInlineDataBlock,
  PublicationArticleViewData,
} from "@/news/article";
import { buttonVariants } from "../ui/button";
import { StatusPill } from "../ui/status-pill";
import { ArticleEmbedBlock } from "./article-embeds";
import { EditorialArticleActions } from "./editorial-actions";
import { ReadingProgress } from "./reading-progress";
import { PublicationStoryCard } from "./story-card";

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

function parseBodyBlock(block: string): PublicationArticleBodyBlock | null {
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
): PublicationArticleBodyBlock[] {
  const text = body.trim().length > 0 ? body : fallback;
  return text
    .split(/\n{2,}/)
    .map(parseBodyBlock)
    .filter((block): block is PublicationArticleBodyBlock => block !== null);
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

function renderBodyBlock(
  block: PublicationArticleBodyBlock,
  index: number,
  options: { pullQuote: boolean; quoteCaption: string },
) {
  switch (block.type) {
    case "heading":
      return (
        <h2
          key={`${index}-${block.text}`}
          className="heading-auspex pt-4 text-xl leading-snug"
        >
          {block.text}
        </h2>
      );
    case "quote":
      return (
        <figure
          key={`${index}-${block.text}`}
          className={cn(
            "my-2 border-l-2 border-primary/80 bg-primary/5 py-3 pl-4 pr-3",
            options.pullQuote &&
              "relative -mx-1 rounded-control border border-primary/25 border-l-primary p-4 shadow-[0_0_22px_-18px_var(--glow-lilac),var(--bevel)] sm:-mx-4 sm:p-5",
          )}
          data-slot={options.pullQuote ? "article-pull-quote" : undefined}
        >
          <blockquote className="font-display text-xl font-medium leading-8 text-foreground sm:text-2xl sm:leading-9">
            {block.text}
          </blockquote>
          {options.pullQuote ? (
            <figcaption className="metric mt-3 text-xs text-muted-foreground">
              Pulled from {options.quoteCaption}
            </figcaption>
          ) : null}
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
    case "embed":
      return (
        <ArticleEmbedBlock
          embed={block.embed}
          key={`${index}-${block.embed.kind}-${block.embed.id}`}
        />
      );
  }
}

function renderArticleBodyBlocks(
  blocks: readonly PublicationArticleBodyBlock[],
  input: { quoteCaption: string },
) {
  let pullQuoteCount = 0;

  return blocks.map((block, index) => {
    const pullQuote = block.type === "quote" && pullQuoteCount < 2;
    if (pullQuote) {
      pullQuoteCount += 1;
    }
    return renderBodyBlock(block, index, {
      pullQuote,
      quoteCaption: input.quoteCaption,
    });
  });
}

function inlineDataToneClass(
  tone: PublicationArticleInlineDataBlock["rows"][number]["tone"],
): string {
  switch (tone) {
    case "negative":
      return "text-negative";
    case "positive":
      return "text-positive";
    case "value":
      return "text-warning";
    default:
      return "text-foreground";
  }
}

function ArticleInlineDataBlock({
  block,
}: {
  block: PublicationArticleInlineDataBlock;
}) {
  return (
    <figure
      aria-label={block.title}
      className="panel grid gap-4 p-4 sm:p-5"
      data-inline-data-kind={block.kind}
      data-slot="article-inline-data-block"
    >
      <header className="grid gap-1">
        <p className="eyebrow text-primary">Filed data</p>
        <h3 className="heading-auspex text-base">{block.title}</h3>
      </header>
      <figcaption className="text-sm leading-6 text-muted-foreground">
        {block.caption}
      </figcaption>
      <div className="overflow-x-auto rounded-control border border-input bg-[var(--panel-2)] shadow-[var(--bevel)]">
        <table
          aria-label={block.title}
          className="w-full min-w-[34rem] text-left text-sm"
        >
          <thead className="bg-elevated">
            <tr>
              <th
                className="eyebrow border-border border-b px-3 py-2"
                scope="col"
              >
                {block.kind === "ranked" ? "Rank" : "Beat"}
              </th>
              <th
                className="eyebrow border-border border-b px-3 py-2"
                scope="col"
              >
                Subject
              </th>
              <th
                className="eyebrow border-border border-b px-3 py-2"
                scope="col"
              >
                Readout
              </th>
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, index) => (
              <tr className="border-border border-t" key={row.id}>
                <td className="metric px-3 py-3 align-top text-primary">
                  {row.metric ?? index + 1}
                </td>
                <td className="px-3 py-3 align-top">
                  <p className="font-semibold text-foreground">{row.label}</p>
                  {row.detail ? (
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {row.detail}
                    </p>
                  ) : null}
                </td>
                <td
                  className={cn(
                    "metric px-3 py-3 align-top text-xs",
                    inlineDataToneClass(row.tone),
                  )}
                >
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

export function PublicationArticleView({
  data,
}: {
  data: PublicationArticleViewData;
}) {
  const bodyBlocks =
    data.article.bodyBlocks.length > 0
      ? data.article.bodyBlocks
      : parseArticleBodyBlocks(data.article.body, data.article.dek);
  const readMinutes = estimatedReadMinutes(data.article.body, data.article.dek);
  const isCastArticle = data.article.kind === "blog";
  const isRetracted = data.article.lifecycle.status === "retracted";
  const isSuperseded = data.article.lifecycle.status === "superseded";
  const bodyId = `article-body-${data.article.id}`;
  const nextStory = data.relatedStories.find((story) => story.href);
  const nextHref = nextStory?.href ?? data.article.section.href;

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
      <ReadingProgress targetId={bodyId} />

      <article className="grid gap-6" data-slot="publication-article">
        <header className="panel mx-auto grid w-full max-w-[76ch] gap-5 p-4 sm:p-6">
          <Link
            href={data.article.section.href}
            className="eyebrow w-fit text-primary underline-offset-4 hover:underline"
          >
            {data.article.section.label}
          </Link>
          <h1 className="heading-auspex text-xl leading-tight">
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
              <p className="font-display text-sm font-medium text-foreground">
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
            {data.article.lifecycle.status !== "published" ? (
              <StatusPill
                showDot={false}
                tone={isRetracted ? "danger" : "warning"}
              >
                {data.article.lifecycle.status}
              </StatusPill>
            ) : null}
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

        {isRetracted ? (
          <section
            aria-label="Retracted article"
            className="panel mx-auto grid w-full max-w-[72ch] gap-3 border-coral/45 p-4 shadow-[0_0_18px_rgba(224,138,138,.16),var(--bevel)] sm:p-6"
          >
            <div className="flex items-center gap-3">
              <span className="chip-glyph flex size-10 items-center justify-center">
                <Ban className="size-4 text-coral" aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow text-coral">Retracted</p>
                <h2 className="heading-auspex text-base">
                  Retracted by the commissioner
                </h2>
              </div>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              {data.article.lifecycle.retractionReason ??
                "This post is no longer available in the league press."}
            </p>
          </section>
        ) : (
          <section
            aria-label="Article body"
            id={bodyId}
            className="panel mx-auto w-full max-w-[72ch] p-4 sm:p-6"
          >
            {isSuperseded ? (
              <div className="mb-5 rounded-control border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                {data.article.lifecycle.replacementHref ? (
                  <Link
                    href={data.article.lifecycle.replacementHref}
                    className="font-semibold underline-offset-4 hover:underline"
                  >
                    Updated version:{" "}
                    {data.article.lifecycle.replacementTitle ??
                      "Read the replacement"}
                  </Link>
                ) : (
                  "This post has been superseded by a newer version."
                )}
              </div>
            ) : null}
            <EditorialProse>
              {bodyBlocks.length > 0 ? (
                renderArticleBodyBlocks(bodyBlocks, {
                  quoteCaption: data.article.byline,
                })
              ) : (
                <p className="cell border-dashed px-3 py-3 text-sm text-muted-foreground">
                  This article does not have body text yet.
                </p>
              )}
            </EditorialProse>
          </section>
        )}

        {data.editorial ? (
          <EditorialArticleActions
            canManage={data.editorial.canManage}
            lifecycleStatus={data.article.lifecycle.status}
            regenerateApiUrl={data.editorial.regenerateApiUrl}
            retractApiUrl={data.editorial.retractApiUrl}
          />
        ) : null}

        {data.article.inlineDataBlocks.length > 0 ? (
          <section
            aria-label="Article data blocks"
            className="mx-auto grid w-full max-w-4xl gap-4"
            data-slot="article-inline-data"
          >
            {data.article.inlineDataBlocks.map((block) => (
              <ArticleInlineDataBlock block={block} key={block.id} />
            ))}
          </section>
        ) : null}

        {data.article.canonCitations.length > 0 ? (
          <aside
            aria-label="Cited canon"
            className="panel mx-auto grid w-full max-w-[72ch] gap-3 border-primary/35 p-4"
          >
            <div>
              <p className="flex items-center gap-2 font-display text-sm font-medium">
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

        {data.editorial ? (
          <aside
            aria-label="Editorial ledger"
            className="mx-auto grid w-full max-w-[72ch] gap-3"
          >
            <div>
              <p className="eyebrow text-primary">Editorial</p>
              <h2 className="heading-auspex text-base">Public ledger</h2>
            </div>
            <EditLedgerFeed
              emptyBody="No editorial action has been recorded for this post."
              emptyTitle="No editorial actions"
              entries={data.editorial.ledgerEntries}
              maxEntries={6}
            />
          </aside>
        ) : null}
      </article>

      <section className="grid gap-3" aria-label="Related stories">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow text-primary">Keep reading</p>
            <h2 className="heading-auspex mt-1 text-base">Related stories</h2>
          </div>
          <Link
            href={nextHref}
            className={cn(
              buttonVariants({
                className: "w-fit",
                variant: "default",
              }),
            )}
          >
            Next in {data.article.section.label}
            <ArrowRight data-icon="inline-end" />
          </Link>
        </div>
        {data.relatedStories.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.relatedStories.map((story) => (
              <PublicationStoryCard
                key={story.id}
                story={story}
                variant="rail"
              />
            ))}
          </div>
        ) : (
          <div className="cell p-4 text-sm text-muted-foreground">
            The section front is the next stop for this beat.
          </div>
        )}
      </section>
    </main>
  );
}
