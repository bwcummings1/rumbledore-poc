import { returnToFromSearchParams } from "@/onboarding/return-to";
import { SleeperConnectPanel } from "./sleeper-connect-panel";

interface SleeperOnboardingPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SleeperOnboardingPage({
  searchParams,
}: SleeperOnboardingPageProps = {}) {
  const returnTo = returnToFromSearchParams(await searchParams);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-4 py-6 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="grid gap-2">
        <p className="text-sm font-medium text-primary">Sleeper connect</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Bring your Sleeper league into Rumbledore
        </h1>
        <p className="max-w-xl text-base text-muted-foreground">
          Enter a public Sleeper username or user ID, choose discovered NFL
          leagues, and import the history you want active.
        </p>
      </header>
      <SleeperConnectPanel returnTo={returnTo} />
    </main>
  );
}
