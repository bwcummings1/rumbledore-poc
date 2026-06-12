import { ShieldAlert } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLeagueRole } from "@/auth/guards";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db";
import { getLeagueHomeData } from "@/home/league-home";
import { cn } from "@/lib/utils";
import { LeagueHomeView } from "./league-home-view";

interface LeagueHomePageProps {
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

export default async function LeagueHomePage({ params }: LeagueHomePageProps) {
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
          body="Connect ESPN or sign in before opening a league home."
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

  const result = await getLeagueHomeData(db, {
    leagueId,
    userId: access.value.userId,
    userRole: access.value.role,
  });

  switch (result.status) {
    case "ready":
      return <LeagueHomeView data={result.data} />;
    case "forbidden":
      return (
        <AccessState
          title="No league access"
          body="This account is not a member of that league."
        />
      );
    case "not_found":
      notFound();
  }
}
