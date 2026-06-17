import { returnToFromSearchParams } from "@/onboarding/return-to";
import { EspnConnectPanel } from "./espn-connect-panel";

interface EspnOnboardingPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function EspnOnboardingPage({
  searchParams,
}: EspnOnboardingPageProps = {}) {
  const returnTo = returnToFromSearchParams(await searchParams);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-5 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="panel grid gap-3 p-5">
        <p className="eyebrow text-primary">ESPN connect</p>
        <h1 className="font-display text-2xl font-medium text-foreground sm:text-3xl">
          Bring your league into Rumbledore
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Connect once, discover every ESPN fantasy league on the account, then
          import the leagues you want active.
        </p>
      </header>
      <EspnConnectPanel returnTo={returnTo} />
    </main>
  );
}
