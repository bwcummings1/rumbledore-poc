import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
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
    <Alert
      actions={
        error.reconnect ? (
          <ReconnectActionLink action={error.reconnect} />
        ) : null
      }
      tone="danger"
    >
      {error.message}
    </Alert>
  );
}
