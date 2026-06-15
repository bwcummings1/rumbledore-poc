import { returnToFromSearchParams } from "@/onboarding/return-to";
import { YahooConnectPanel } from "./yahoo-connect-panel";

interface YahooOnboardingPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function YahooOnboardingPage({
  searchParams,
}: YahooOnboardingPageProps = {}) {
  const returnTo = returnToFromSearchParams(await searchParams);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-4 py-6 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="grid gap-2">
        <p className="text-sm font-medium text-primary">Yahoo connect</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Bring your Yahoo league into Rumbledore
        </h1>
        <p className="max-w-xl text-base text-muted-foreground">
          Authorize Yahoo Fantasy access, choose discovered NFL leagues, and
          import the history you want active.
        </p>
      </header>
      <YahooConnectPanel returnTo={returnTo} />
    </main>
  );
}
