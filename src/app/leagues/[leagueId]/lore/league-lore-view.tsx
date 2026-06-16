import {
  ArrowLeft,
  BookOpenText,
  FilePlus2,
  Landmark,
  ShieldCheck,
  Tags,
  Vote,
} from "lucide-react";
import Link from "next/link";
import { DEFAULT_PERSONA_CARDS } from "@/ai/personas";
import {
  CastAiBadge,
  CastPersonaByline,
} from "@/components/cast/cast-presence";
import { InstigatorProvocationCard } from "@/components/lore/instigator-ui";
import { LoreVoteWidget } from "@/components/lore/lore-vote-widget";
import {
  type PublicationStory,
  PublicationStoryCard,
} from "@/components/publication/story-card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import type {
  LoreClaimAuthorSummary,
  LoreClaimCard,
  LoreSectionData,
} from "@/lore/member-ui";
import { buildPublicationFront } from "@/news/front";

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function provenanceLabel(claim: LoreClaimCard): string {
  if (claim.status === "disputed") {
    return "Canon under challenge";
  }
  switch (claim.ratifiedBy) {
    case "verified":
      return "Canon - verified";
    case "steward":
      return "Canon - steward";
    case "vote":
    case null:
      return "Canon - league decided";
  }
}

function relationLabel(relation: LoreClaimCard["relation"]): string {
  return relation.replaceAll("_", " ");
}

function subjectRead(claim: LoreClaimCard): string | null {
  if (claim.subjects.length === 0) {
    return null;
  }
  return `Subjects: ${claim.subjects.map((subject) => subject.label).join(", ")}`;
}

function LoreAuthorByline({
  author,
  compact = false,
}: {
  readonly author: LoreClaimAuthorSummary;
  readonly compact?: boolean;
}) {
  if (author.isAi && author.persona) {
    const card = DEFAULT_PERSONA_CARDS[author.persona];
    return (
      <CastPersonaByline
        beat={card.beat}
        className={compact ? "text-xs" : undefined}
        name={card.name}
        persona={author.persona}
        state="speaking"
      />
    );
  }

  return (
    <p className="flex flex-wrap items-center gap-2">
      <span className="metric text-xs text-muted-foreground">
        {author.displayName}
      </span>
      {author.isAi ? <CastAiBadge /> : null}
    </p>
  );
}

function toCanonStory({
  claim,
  leagueId,
}: {
  claim: LoreClaimCard;
  leagueId: string;
}): PublicationStory {
  const branchRead =
    claim.relation === "root"
      ? null
      : `Branch: ${relationLabel(claim.relation)}`;
  return {
    byline: claim.author.isAi
      ? `${claim.author.displayName} - AI cast`
      : claim.author.displayName,
    dek: claim.bodyPreview,
    headline: claim.title,
    href: `/leagues/${encodeURIComponent(leagueId)}/lore/${encodeURIComponent(claim.id)}`,
    hrefLabel: "Open claim",
    id: claim.id,
    publishedAt: claim.ratifiedAt ?? claim.createdAt,
    relevanceReason: [subjectRead(claim), branchRead]
      .filter((part): part is string => Boolean(part))
      .join(" | "),
    sectionTag: provenanceLabel(claim),
  };
}

function subjectHref(leagueId: string, subjectKey: string): string {
  const params = new URLSearchParams({ subject: subjectKey });
  return `/leagues/${encodeURIComponent(leagueId)}/lore?${params.toString()}`;
}

function loreVoteApiUrl(leagueId: string, claimId: string): string {
  return `/api/leagues/${encodeURIComponent(leagueId)}/lore/claims/${encodeURIComponent(claimId)}/votes`;
}

function OpenVoteCard({
  claim,
  leagueId,
}: {
  readonly claim: LoreClaimCard;
  readonly leagueId: string;
}) {
  const widget = claim.instigation?.poll ? (
    <LoreVoteWidget mode="poll" poll={claim.instigation.poll} size="compact" />
  ) : claim.vote ? (
    <LoreVoteWidget
      mode="lore"
      size="compact"
      vote={claim.vote}
      voteApiUrl={loreVoteApiUrl(leagueId, claim.id)}
    />
  ) : null;

  if (claim.instigation) {
    return (
      <InstigatorProvocationCard claim={claim} leagueId={leagueId}>
        {widget}
      </InstigatorProvocationCard>
    );
  }

  return (
    <article className="panel grid gap-3 p-4" data-slot="open-lore-vote-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <LoreAuthorByline author={claim.author} compact={true} />
          <h2 className="mt-1 font-display text-base font-semibold text-foreground">
            <Link
              href={`/leagues/${encodeURIComponent(leagueId)}/lore/${encodeURIComponent(claim.id)}`}
              className="hover:text-primary focus-visible:shadow-[var(--focus-ring-shadow)] focus-visible:outline-none"
            >
              {claim.title}
            </Link>
          </h2>
        </div>
        <StatusPill showDot={false} tone="info">
          Vote
        </StatusPill>
      </div>
      <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
        {claim.bodyPreview}
      </p>
      {widget}
    </article>
  );
}

export function LeagueLoreView({ data }: { data: LoreSectionData }) {
  const submitHref = `/leagues/${encodeURIComponent(data.league.id)}/lore/new`;
  const canonFront = buildPublicationFront(data.canon);
  const canonHeading = data.activeSubject
    ? `Canon about ${data.activeSubject.label}`
    : "Official canon";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="grid gap-4">
        <Link
          href={`/leagues/${encodeURIComponent(data.league.id)}`}
          className={cn(
            buttonVariants({ className: "w-fit", variant: "ghost" }),
          )}
        >
          <ArrowLeft data-icon="inline-start" />
          League home
        </Link>

        <div className="panel grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-primary">
              <Landmark className="size-5" aria-hidden="true" />
              <p className="eyebrow text-primary">Official mythology</p>
            </div>
            <h1 className="h-grad mt-3 font-display text-xl font-semibold sm:text-2xl">
              {data.league.name} official lore
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              A calmer ledger for claims members submit, facts the record can
              verify, and arguments the league settles by vote.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Link
              href={submitHref}
              className={cn(buttonVariants({ className: "w-full sm:w-auto" }))}
            >
              <FilePlus2 data-icon="inline-start" />
              Submit claim
            </Link>
            <Link
              href={data.stewardReviewHref}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              <ShieldCheck data-icon="inline-start" />
              Steward review
            </Link>
          </div>
        </div>
      </header>

      <section aria-label="Lore status" className="grid gap-3 sm:grid-cols-3">
        <StatTile
          caption="Ratified and citeable by the cast"
          label="Canon entries"
          value={formatCount(data.counts.canon)}
        />
        <StatTile
          caption="Live decisions awaiting members"
          label="Open votes"
          tone="lilac"
          value={formatCount(data.counts.openVotes)}
        />
        <StatTile
          caption="Claims contradicted by imported history"
          label="Refuted facts"
          tone="amber"
          value={formatCount(data.counts.refuted)}
        />
      </section>

      <section className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <BookOpenText
                className="size-4 text-primary"
                aria-hidden="true"
              />
              {canonHeading}
            </p>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Ratified claims are tiered like the league publication, but this
              register is the official ledger the cast can cite as settled
              truth.
            </p>
          </div>
          {data.activeSubject ? (
            <Link
              href={`/leagues/${encodeURIComponent(data.league.id)}/lore`}
              className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
            >
              Clear filter
            </Link>
          ) : null}
        </div>

        {data.subjectFilters.length > 0 ? (
          <nav
            aria-label="Lore subject filters"
            className="flex flex-wrap gap-2"
          >
            <Link
              href={`/leagues/${encodeURIComponent(data.league.id)}/lore`}
              aria-current={data.activeSubject ? undefined : "page"}
              className={cn(
                buttonVariants({
                  className: "w-fit",
                  size: "sm",
                  variant: data.activeSubject ? "outline" : "default",
                }),
              )}
            >
              <Tags data-icon="inline-start" />
              All canon
            </Link>
            {data.subjectFilters.map((subject) => (
              <Link
                key={subject.key}
                href={subjectHref(data.league.id, subject.key)}
                aria-current={
                  data.activeSubject?.key === subject.key ? "page" : undefined
                }
                className={cn(
                  buttonVariants({
                    className: "w-fit",
                    size: "sm",
                    variant:
                      data.activeSubject?.key === subject.key
                        ? "default"
                        : "outline",
                  }),
                )}
              >
                {subject.label}
                <span className="font-mono text-xs tabular-nums">
                  {formatCount(subject.count)}
                </span>
              </Link>
            ))}
          </nav>
        ) : null}

        {canonFront.lead ? (
          <div className="grid gap-5">
            <section aria-label="Lead canon" data-front-tier="lead">
              <PublicationStoryCard
                story={toCanonStory({
                  claim: canonFront.lead,
                  leagueId: data.league.id,
                })}
                variant="hero"
              />
            </section>
            {canonFront.secondaries.length > 0 ? (
              <section
                className="grid gap-3 md:grid-cols-3"
                aria-label="Secondary canon"
                data-front-tier="secondary"
              >
                {canonFront.secondaries.map((claim) => (
                  <PublicationStoryCard
                    key={claim.id}
                    story={toCanonStory({ claim, leagueId: data.league.id })}
                    variant="secondary"
                  />
                ))}
              </section>
            ) : null}
            {canonFront.river.length > 0 ? (
              <section
                className="grid gap-3 sm:grid-cols-2"
                aria-label="Canon river"
                data-front-tier="river"
              >
                {canonFront.river.map((claim) => (
                  <PublicationStoryCard
                    key={claim.id}
                    story={toCanonStory({ claim, leagueId: data.league.id })}
                    variant="river"
                  />
                ))}
              </section>
            ) : null}
          </div>
        ) : (
          <EmptyState
            action={
              data.activeSubject ? (
                <Link
                  href={`/leagues/${encodeURIComponent(data.league.id)}/lore`}
                  className={cn(buttonVariants({ variant: "outline" }))}
                >
                  Clear filter
                </Link>
              ) : (
                <Link
                  href={submitHref}
                  className={cn(buttonVariants({ variant: "secondary" }))}
                >
                  <FilePlus2 data-icon="inline-start" />
                  Make the first claim
                </Link>
              )
            }
            title={
              data.activeSubject ? "No canon for this subject" : "No canon yet"
            }
          >
            <p>
              {data.activeSubject
                ? "Clear the subject filter to browse the full ledger."
                : "Make the first claim, let the league vote, and the record will start here."}
            </p>
          </EmptyState>
        )}
      </section>

      <section className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Vote className="size-4 text-primary" aria-hidden="true" />
              In the arena now
            </p>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Open claims show the live threshold, the close window, and the
              exact tally the league will be judged on.
            </p>
          </div>
          <Link
            href={submitHref}
            className={cn(buttonVariants({ variant: "secondary" }))}
          >
            <FilePlus2 data-icon="inline-start" />
            New claim
          </Link>
        </div>

        {data.openVotes.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.openVotes.map((claim) => (
              <OpenVoteCard
                claim={claim}
                key={claim.id}
                leagueId={data.league.id}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            action={
              <Link
                href={submitHref}
                className={cn(buttonVariants({ variant: "secondary" }))}
              >
                <FilePlus2 data-icon="inline-start" />
                New claim
              </Link>
            }
            title="Start the record"
          >
            <p>
              Opinion claims open a league vote. Structured fact claims are
              checked against imported weekly, season, and all-time records
              before the league has to argue about them.
            </p>
          </EmptyState>
        )}
      </section>
    </main>
  );
}
