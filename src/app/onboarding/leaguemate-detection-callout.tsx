import { Link2, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
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
  if (!summary || summary.inviteTargets === 0) {
    return null;
  }

  const inviteLabel = leaguemateLabel(summary.inviteTargets);

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Users className="size-4 shrink-0 text-primary" aria-hidden />
            We found your {inviteLabel}.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {summary.importedMembers} imported managers ·{" "}
            {targetPreview(summary)}
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
            href={`/leagues/${leagueId}/members`}
            className={cn(buttonVariants({ size: "sm" }))}
          >
            <Link2 data-icon="inline-start" />
            Invite roster
          </Link>
        </div>
      </div>
    </div>
  );
}
