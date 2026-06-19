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
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-5 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="panel grid gap-3 p-5">
        <p className="eyebrow text-primary">Sleeper connect</p>
        <h1 className="heading-auspex text-xl leading-tight">
          Bring your Sleeper league into Rumbledore
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Enter a public Sleeper username or user ID, choose discovered NFL
          leagues, and import the history you want active.
        </p>
      </header>
      <SleeperConnectPanel returnTo={returnTo} />
    </main>
  );
}
