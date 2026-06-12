import { ShieldAlert } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLeagueRole } from "@/auth/guards";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db";
import { cn } from "@/lib/utils";
import { getLeagueInviteDependencies } from "@/onboarding/deps";
import { listLeaguemateInviteTargets } from "@/onboarding/invites";
import { LeagueInviteView } from "./league-invite-view";

export const dynamic = "force-dynamic";

interface LeagueInvitePageProps {
  params: Promise<{ leagueId: string }>;
}

function AccessState({ body, title }: { body: string; title: string }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-6 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))]">
      <ShieldAlert className="size-6 text-highlight" aria-hidden="true" />
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      </div>
      <Link
        href="/onboarding/espn"
        className={cn(buttonVariants({ className: "w-fit" }))}
      >
        Connect ESPN
      </Link>
    </main>
  );
}

export default async function LeagueInvitePage({
  params,
}: LeagueInvitePageProps) {
  const { leagueId } = await params;
  const db = getDb();
  const access = await requireLeagueRole({
    db,
    headers: await headers(),
    leagueId,
    minRole: "member",
  });

  if (!access.ok) {
    if (access.error.code === "INVALID_LEAGUE_ID") {
      notFound();
    }
    if (access.error.status === 401) {
      return (
        <AccessState
          title="Sign in required"
          body="Sign in before inviting leaguemates."
        />
      );
    }
    return (
      <AccessState
        title="No league access"
        body="This account is not a member of that league."
      />
    );
  }

  const result = await listLeaguemateInviteTargets(
    getLeagueInviteDependencies(),
    {
      leagueId,
      userId: access.value.userId,
      userRole: access.value.role,
    },
  );

  if (!result.ok) {
    if (result.error.status === 404) {
      notFound();
    }
    return (
      <AccessState title="Invites unavailable" body={result.error.message} />
    );
  }

  return <LeagueInviteView initialSummary={result.value} />;
}
