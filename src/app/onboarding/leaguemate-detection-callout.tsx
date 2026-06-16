import { Link2, Mail, MessageSquare, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/utils";

export interface ImportLeaguemateSummary {
  importedMembers: number;
  inviteTargets: number;
  stewardReview?: {
    href: string;
    needsReview: boolean;
    suggestedIdentityLinks: number;
    unresolvedIntegrityChecks: number;
  };
  targets: Array<{
    displayName: string;
    providerMemberId: string;
    suggestedChannel: "share" | "sms" | "email";
    teamNames: string[];
  }>;
}

function leaguemateLabel(count: number): string {
  return `${count} leaguemate${count === 1 ? "" : "s"}`;
}

function targetPreview(summary: ImportLeaguemateSummary): string {
  const sample = summary.targets.slice(0, 3).map((target) => {
    const teamName = target.teamNames[0];
    return teamName
      ? `${target.displayName} (${teamName})`
      : target.displayName;
  });
  const remaining = summary.inviteTargets - sample.length;
  return remaining > 0
    ? `${sample.join(", ")} + ${remaining} more`
    : sample.join(", ");
}

function stewardReviewLabel(
  review: NonNullable<ImportLeaguemateSummary["stewardReview"]>,
): string {
  const total =
    review.suggestedIdentityLinks + review.unresolvedIntegrityChecks;
  return `${total} data review item${total === 1 ? "" : "s"}`;
}

export function LeaguemateDetectionCallout({
  leagueId,
  summary,
}: {
  leagueId: string;
  summary?: ImportLeaguemateSummary;
}) {
  if (!summary) {
    return null;
  }

  const inviteLabel = leaguemateLabel(summary.inviteTargets);
  const inviteHref = `/leagues/${leagueId}/members`;

  return (
    <div className="mt-3 grid gap-3 border-t border-[var(--hair)] pt-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-display text-sm font-semibold text-foreground">
            <span
              aria-hidden="true"
              className="orb orb-sm"
              data-persona="beat_reporter"
              data-state={summary.inviteTargets > 0 ? "speaking" : "muted"}
            >
              <Users className="size-3" />
            </span>
            We found your {inviteLabel}.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {summary.importedMembers} imported managers
            {summary.inviteTargets > 0 ? ` · ${targetPreview(summary)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {summary.stewardReview?.needsReview ? (
            <Link
              href={summary.stewardReview.href}
              className={cn(
                buttonVariants({ size: "sm", variant: "secondary" }),
              )}
            >
              <ShieldCheck data-icon="inline-start" />
              {stewardReviewLabel(summary.stewardReview)}
            </Link>
          ) : null}
          <Link
            href={inviteHref}
            className={cn(buttonVariants({ size: "sm" }))}
          >
            <Link2 data-icon="inline-start" />
            Invite roster
          </Link>
        </div>
      </div>
      {summary.inviteTargets > 0 ? (
        <ul
          aria-label="Detected leaguemates"
          className="grid gap-2 sm:grid-cols-2"
        >
          {summary.targets.slice(0, 4).map((target) => (
            <li
              className="cell grid gap-2 px-3 py-3"
              key={target.providerMemberId}
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {target.displayName}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {target.teamNames.length > 0
                      ? target.teamNames.join(", ")
                      : "Team match pending"}
                  </p>
                </div>
                <SuggestedChannelPill channel={target.suggestedChannel} />
              </div>
            </li>
          ))}
          {summary.inviteTargets > 4 ? (
            <li className="cell flex items-center justify-center px-3 py-3 text-center text-sm text-muted-foreground">
              + {summary.inviteTargets - 4} more on the invite roster
            </li>
          ) : null}
        </ul>
      ) : (
        <div className="cell flex flex-wrap items-center justify-between gap-3 px-3 py-3">
          <p className="text-sm text-muted-foreground">
            You're the only one imported so far. Use the roster invite surface
            when more provider members are available.
          </p>
          <StatusPill tone="neutral">none waiting</StatusPill>
        </div>
      )}
    </div>
  );
}

function SuggestedChannelPill({
  channel,
}: {
  readonly channel: ImportLeaguemateSummary["targets"][number]["suggestedChannel"];
}) {
  switch (channel) {
    case "email":
      return <Tag leadingIcon={<Mail />}>email</Tag>;
    case "sms":
      return <Tag leadingIcon={<MessageSquare />}>sms</Tag>;
    case "share":
      return <Tag leadingIcon={<Link2 />}>share</Tag>;
  }
}
