import {
  ArrowRight,
  Ban,
  LockKeyhole,
  Newspaper,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import type { LeaguePressArticleTeaserData } from "@/news";

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

function lifecycleNotice(
  status: LeaguePressArticleTeaserData["article"]["lifecycle"]["status"],
) {
  switch (status) {
    case "retracted":
      return {
        icon: Ban,
        label: "Retracted",
        title: "No longer available",
        body: "This shared Press link is no longer available.",
        tone: "danger" as const,
      };
    case "superseded":
      return {
        icon: Newspaper,
        label: "Updated",
        title: "Updated inside the league Press",
        body: "This shared Press link points to an older version.",
        tone: "warning" as const,
      };
    case "published":
      return null;
  }
}

export function LeagueArticleTeaserView({
  claimHref,
  data,
}: {
  claimHref: string;
  data: LeaguePressArticleTeaserData;
}) {
  const notice = lifecycleNotice(data.article.lifecycle.status);
  const NoticeIcon = notice?.icon;
  const noticeToneClass =
    notice?.tone === "warning" ? "text-warning" : "text-coral";
  const noticeFrameClass =
    notice?.tone === "warning"
      ? "border-warning/35 bg-warning/10"
      : "border-coral/35 bg-coral/10";

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col justify-center gap-5 px-4 py-6 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6"
      data-slot="league-article-teaser"
    >
      <article className="panel grid gap-5 p-4 sm:p-6">
        <header className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow text-primary">
              Shared from {data.publicationLabel}
            </p>
            <span className="metric rounded-control border border-input bg-[var(--panel-2)] px-2 py-1 text-xs text-muted-foreground">
              {data.league.season} season
            </span>
          </div>
          <div className="grid gap-3">
            <Link
              href={data.article.section.href}
              className="eyebrow w-fit text-primary underline-offset-4 hover:underline"
            >
              {data.article.section.label}
            </Link>
            <h1 className="heading-auspex text-xl leading-tight sm:text-2xl">
              {data.article.headline}
            </h1>
            {data.article.dek ? (
              <p className="max-w-[62ch] font-body text-lg leading-8 text-muted-foreground">
                {data.article.dek}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span
              aria-hidden="true"
              className="orb orb-sm"
              data-slot="teaser-byline-orb"
            />
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
            <span aria-hidden="true">|</span>
            <time
              className="metric text-xs"
              dateTime={data.article.publishedAt}
            >
              {formatPublishedAt(data.article.publishedAt)}
            </time>
            {data.article.lifecycle.status !== "published" ? (
              <StatusPill showDot={false} tone={notice?.tone ?? "warning"}>
                {notice?.label ?? data.article.lifecycle.status}
              </StatusPill>
            ) : null}
          </div>
        </header>

        {notice ? (
          <section
            aria-label="Retracted article"
            className={cn("rounded-card border p-4", noticeFrameClass)}
          >
            <div className="flex items-start gap-3">
              <span className="chip-glyph flex size-10 items-center justify-center">
                {NoticeIcon ? (
                  <NoticeIcon
                    className={cn("size-4", noticeToneClass)}
                    aria-hidden="true"
                  />
                ) : null}
              </span>
              <div className="grid gap-1">
                <p className={cn("eyebrow", noticeToneClass)}>{notice.label}</p>
                <h2 className="font-display text-base font-medium text-foreground">
                  {notice.title}
                </h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  {notice.body}
                </p>
              </div>
            </div>
          </section>
        ) : (
          <section
            aria-label="Article teaser"
            className="rounded-card border border-[var(--hair)] bg-[var(--panel-2)] p-4 shadow-[var(--bevel)]"
          >
            <p className="eyebrow text-primary">First look</p>
            <p className="mt-2 text-base leading-8 text-foreground">
              {data.article.lede || data.article.dek}
            </p>
          </section>
        )}
      </article>

      <aside
        aria-label="Claim your team"
        className="panel grid gap-3 border-primary/35 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
      >
        <span className="chip-glyph flex size-10 items-center justify-center">
          <UserPlus className="size-4 text-primary" aria-hidden="true" />
        </span>
        <div className="grid gap-1">
          <p className="eyebrow text-primary">Claim your team</p>
          <h2 className="font-display text-base font-medium text-foreground">
            Read the full {data.league.name} story.
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Connect the fantasy account that belongs in this league and return
            to this exact article.
          </p>
        </div>
        <Link
          href={claimHref}
          className={cn(buttonVariants({ className: "w-fit", size: "sm" }))}
        >
          <LockKeyhole data-icon="inline-start" />
          Claim team
          <ArrowRight data-icon="inline-end" />
        </Link>
      </aside>
    </main>
  );
}
