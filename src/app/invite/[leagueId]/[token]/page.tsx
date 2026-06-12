import { ShieldAlert, UserPlus } from "lucide-react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireSession } from "@/auth/guards";
import { getDb } from "@/db";
import { getLeagueInviteLanding } from "@/onboarding/invites";
import { InviteAcceptPanel } from "./invite-accept-panel";

export const dynamic = "force-dynamic";

interface InvitePreviewPageProps {
  params: Promise<{ leagueId: string; token: string }>;
}

function teamLabel(teamNames: readonly string[]): string {
  return teamNames.length > 0 ? teamNames.join(", ") : "Team match pending";
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

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-5 px-4 py-6 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">Rumbledore invite</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {invite.value.league.name}
          </h1>
        </div>
        <UserPlus className="size-7 text-primary" aria-hidden />
      </div>

      <section className="rounded-card border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <ShieldAlert
            className="mt-0.5 size-5 shrink-0 text-highlight"
            aria-hidden
          />
          <div className="min-w-0">
            <h2 className="text-base font-semibold">
              {invite.value.inviteeDisplayName}
            </h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {teamLabel(invite.value.teamNames)}
            </p>
          </div>
        </div>
      </section>

      <InviteAcceptPanel
        acceptUrl={`/api/invite/${leagueId}/${token}/accept`}
        isAuthenticated={isAuthenticated}
        onboardingUrl={`/onboarding/${invite.value.league.provider}`}
      />
    </main>
  );
}
