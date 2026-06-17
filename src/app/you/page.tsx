import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPersonalAgentBriefing } from "@/ai/personal-agent";
import { requireSession } from "@/auth/guards";
import { buttonVariants } from "@/components/ui/button";
import { getEnv } from "@/core/env";
import { getDb } from "@/db";
import { providerCredentials, users } from "@/db/schema";
import { cn } from "@/lib/utils";
import {
  getProviderBadgeLabel,
  serializeLeagueSwitcherItem,
} from "@/navigation";
import { listLeagueSwitcherItemsForUser } from "@/navigation/league-switcher-data";
import { type YouAccountData, YouAccountView } from "./you-account-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "You | Rumbledore",
  description: "Account, providers, notifications, and installed leagues.",
};

function SignInRequired() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-6 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))]">
      <div>
        <h1 className="text-xl font-medium">Sign in required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect a league or sign in before opening account settings.
        </p>
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

export default async function YouPage() {
  const session = await requireSession({ headers: await headers() });
  if (!session.ok) {
    return <SignInRequired />;
  }

  const db = getDb();
  const env = getEnv();
  const [user] = await db
    .select({
      displayName: users.displayName,
      email: users.email,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(eq(users.id, session.value.userId))
    .limit(1);

  if (!user) {
    notFound();
  }

  const credentialRows = await db
    .select({
      connectionFlow: providerCredentials.connectionFlow,
      invalidAt: providerCredentials.invalidAt,
      lastValidatedAt: providerCredentials.lastValidatedAt,
      provider: providerCredentials.provider,
      status: providerCredentials.status,
      subjectProviderId: providerCredentials.subjectProviderId,
    })
    .from(providerCredentials)
    .where(eq(providerCredentials.userId, session.value.userId))
    .orderBy(asc(providerCredentials.provider));

  const leagues = await listLeagueSwitcherItemsForUser(db, {
    userId: session.value.userId,
  });
  if (!leagues.ok) {
    throw leagues.error;
  }
  const personalAgent = await getPersonalAgentBriefing({
    db,
    env: { entitlements: env.entitlements },
    userId: session.value.userId,
  });

  const data: YouAccountData = {
    connections: credentialRows.map((credential) => ({
      connectionFlow: credential.connectionFlow,
      invalidAt: credential.invalidAt?.toISOString() ?? null,
      lastValidatedAt: credential.lastValidatedAt.toISOString(),
      provider: credential.provider,
      providerLabel: getProviderBadgeLabel(credential.provider),
      status: credential.status,
      subjectProviderId: credential.subjectProviderId,
    })),
    leagues: leagues.value.map(serializeLeagueSwitcherItem),
    personalAgent,
    user,
  };

  return <YouAccountView data={data} />;
}
