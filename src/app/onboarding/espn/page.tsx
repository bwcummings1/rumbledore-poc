import { EspnConnectPanel } from "./espn-connect-panel";

export default function EspnOnboardingPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-4 py-6 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="grid gap-2">
        <p className="text-sm font-medium text-primary">ESPN connect</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Bring your league into Rumbledore
        </h1>
        <p className="max-w-xl text-base text-muted-foreground">
          Connect once, discover every ESPN fantasy league on the account, then
          import the leagues you want active.
        </p>
      </header>
      <EspnConnectPanel />
    </main>
  );
}
