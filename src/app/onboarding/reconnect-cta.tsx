import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProviderReconnectAction } from "@/onboarding/reconnect";
import type { OnboardingPanelError } from "./client-http";

export function ReconnectActionLink({
  action,
}: {
  action: ProviderReconnectAction;
}) {
  return (
    <Link
      href={action.href}
      className={cn(buttonVariants({ size: "sm", variant: "secondary" }))}
    >
      <RefreshCw data-icon="inline-start" />
      {action.label}
    </Link>
  );
}

export function OnboardingErrorBanner({
  error,
}: {
  error: OnboardingPanelError;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <p>{error.message}</p>
      {error.reconnect ? (
        <ReconnectActionLink action={error.reconnect} />
      ) : null}
    </div>
  );
}
