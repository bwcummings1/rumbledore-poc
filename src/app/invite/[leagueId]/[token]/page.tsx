import { ShieldAlert, Trophy, UserPlus } from "lucide-react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireSession } from "@/auth/guards";
import { getDb } from "@/db";
import { getLeagueInviteLanding } from "@/onboarding/invites";
import { withReturnTo } from "@/onboarding/return-to";
import { InviteAcceptPanel } from "./invite-accept-panel";

export const dynamic = "force-dynamic";

interface InvitePreviewPageProps {
  params: Promise<{ leagueId: string; token: string }>;
}

function teamLabel(teamNames: readonly string[]): string {
  return teamNames.length > 0 ? teamNames.join(", ") : "Team match pending";
}

function isOpenClaimMode(mode: "targeted" | "open"): boolean {
  switch (mode) {
    case "open":
      return true;
    case "targeted":
      return false;
  }
}

export default async function InvitePreviewPage({
  params,
}: InvitePreviewPageProps) {
  const { leagueId, token } = await params;
  const invite = await getLeagueInviteLanding(
    { db: getDb() },
    { leagueId, token },
  );

  if (!invite.ok) {
    notFound();
  }

  const session = await requireSession({ headers: await headers() });
  const isAuthenticated = session.ok;
  const isOpenInvite = isOpenClaimMode(invite.value.claimMode);
  const invitePath = `/invite/${encodeURIComponent(leagueId)}/${encodeURIComponent(token)}`;
  const onboardingUrl = withReturnTo(
    `/onboarding/${invite.value.league.provider}`,
    invitePath,
  );
  const managerLabel = isOpenInvite
    ? "Choose an unclaimed team"
    : invite.value.inviteeDisplayName;
  const teamNames = isOpenInvite
    ? invite.value.claimTargets.map((target) => teamLabel(target.teamNames))
    : [teamLabel(invite.value.teamNames)];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-5 px-4 py-6 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="panel grid gap-5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow text-primary">Rumbledore invite</p>
            <h1 className="mt-2 font-display text-2xl font-medium text-foreground sm:text-3xl">
              {invite.value.league.name}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {invite.value.league.season} fantasy football · claim your spot in
              the imported league.
            </p>
          </div>
          <span
            aria-hidden="true"
            className="orb orb-lg"
            data-persona="commissioner"
            data-state="speaking"
          >
            <UserPlus className="size-5" />
          </span>
        </div>

        <section className="bezel grid gap-3 rounded-card border border-border bg-[var(--panel-2)] p-4 shadow-[var(--bevel)]">
          <div className="flex items-start gap-3">
            <ShieldAlert
              className="mt-0.5 size-5 shrink-0 text-highlight"
              aria-hidden
            />
            <div className="min-w-0">
              <h2 className="font-display text-base font-medium text-foreground">
                {isOpenInvite ? "Claim your team" : `You're ${managerLabel}`}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {isOpenInvite
                  ? `${invite.value.claimTargets.length} teams still available`
                  : `The ${teamNames[0]} are waiting for this account.`}
              </p>
            </div>
          </div>
          {teamNames.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {teamNames.slice(0, 4).map((teamName) => (
                <span
                  className="inline-flex min-h-8 items-center gap-2 rounded-control border border-primary/40 bg-primary/10 px-2.5 text-xs font-semibold text-primary shadow-[var(--bevel)]"
                  key={teamName}
                >
                  <Trophy aria-hidden="true" className="size-3.5" />
                  {teamName}
                </span>
              ))}
            </div>
          ) : null}
        </section>
      </header>

      <InviteAcceptPanel
        acceptUrl={`/api/invite/${leagueId}/${token}/accept`}
        claimMode={invite.value.claimMode}
        claimTargets={invite.value.claimTargets}
        isAuthenticated={isAuthenticated}
        onboardingUrl={onboardingUrl}
      />
    </main>
  );
}
