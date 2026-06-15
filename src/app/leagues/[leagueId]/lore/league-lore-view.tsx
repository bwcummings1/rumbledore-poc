import {
  ArrowLeft,
  Clock3,
  FilePlus2,
  Landmark,
  ShieldCheck,
  Vote,
} from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LoreClaimCard, LoreSectionData } from "@/lore/member-ui";

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "No close time set";
  }
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function voteRead(claim: LoreClaimCard): string {
  const vote = claim.vote;
  if (!vote) {
    return "No vote tally recorded.";
  }
  if (vote.passesAtClose) {
    return "Passing if the vote closed now.";
  }
  if (vote.affirmNeeded > 0) {
    return `Needs ${vote.affirmNeeded} more affirm ${vote.affirmNeeded === 1 ? "vote" : "votes"}.`;
  }
  return "Needs affirm to stay ahead of reject.";
}

export function LeagueLoreView({ data }: { data: LoreSectionData }) {
  const submitHref = `/leagues/${encodeURIComponent(data.league.id)}/lore/new`;

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

        <div className="grid gap-4 rounded-card border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-primary">
              <Landmark className="size-5" aria-hidden="true" />
              <p className="text-sm font-medium">Lore</p>
            </div>
            <h1 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
              {data.league.name} official lore
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              The league's narrative record lives here: claims members submit,
              facts the data can verify, and arguments the league decides by
              vote.
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
        <article className="rounded-card border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Canon entries</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
            {formatCount(data.counts.canon)}
          </p>
        </article>
        <article className="rounded-card border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Open votes</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
            {formatCount(data.counts.openVotes)}
          </p>
        </article>
        <article className="rounded-card border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Refuted facts</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
            {formatCount(data.counts.refuted)}
          </p>
        </article>
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
              <article
                key={claim.id}
                className="rounded-card border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase text-muted-foreground">
                      {claim.author.isAi ? "AI-instigated" : "Member claim"}
                    </p>
                    <h2 className="mt-1 text-base font-semibold tracking-tight">
                      <Link
                        href={`/leagues/${encodeURIComponent(data.league.id)}/lore/${encodeURIComponent(claim.id)}`}
                        className="hover:text-primary"
                      >
                        {claim.title}
                      </Link>
                    </h2>
                  </div>
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                    Vote
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                  {claim.bodyPreview}
                </p>
                {claim.vote ? (
                  <div className="mt-4 grid gap-2 text-sm">
                    <div className="grid grid-cols-3 gap-2 text-center font-mono tabular-nums">
                      <span className="rounded-md bg-muted/40 px-2 py-1">
                        {claim.vote.tally.affirm} affirm
                      </span>
                      <span className="rounded-md bg-muted/40 px-2 py-1">
                        {claim.vote.tally.reject} reject
                      </span>
                      <span className="rounded-md bg-muted/40 px-2 py-1">
                        {claim.vote.tally.abstain} abstain
                      </span>
                    </div>
                    <p className="text-muted-foreground">
                      Quorum {claim.vote.tally.quorum} of{" "}
                      {claim.vote.tally.activeMembers} active members.{" "}
                      {voteRead(claim)}
                    </p>
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <Clock3 className="size-4" aria-hidden="true" />
                      Closes {formatDateTime(claim.vote.voteClosesAt)}
                    </p>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-card border border-dashed border-border bg-muted/20 p-4">
            <p className="text-sm font-medium">Start the record</p>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Opinion claims open a league vote. Structured fact claims are
              checked against imported weekly, season, and all-time records
              before the league has to argue about them.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
