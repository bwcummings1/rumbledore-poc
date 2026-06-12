"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface InviteAcceptPanelProps {
  acceptUrl: string;
  isAuthenticated: boolean;
  onboardingUrl: string;
}

interface AcceptedInviteResponse {
  leagueUrl: string;
}

function errorMessage(status: number): string {
  if (status === 401) {
    return "Sign in before accepting this invite.";
  }
  if (status === 409) {
    return "This invite has already been claimed.";
  }
  return "This invite could not be accepted.";
}

export function InviteAcceptPanel({
  acceptUrl,
  isAuthenticated,
  onboardingUrl,
}: InviteAcceptPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);

  async function acceptInvite() {
    setError(null);
    setIsAccepting(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(acceptUrl, {
        method: "POST",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        setError(errorMessage(response.status));
        return;
      }

      const accepted = (await response.json()) as AcceptedInviteResponse;
      window.location.assign(accepted.leagueUrl);
    } catch {
      setError("This invite could not be accepted.");
    } finally {
      window.clearTimeout(timeout);
      setIsAccepting(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-wrap gap-2">
        <Link href={onboardingUrl} className={cn(buttonVariants())}>
          Connect fantasy account
          <ArrowRight data-icon="inline-end" />
        </Link>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          Home
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          className={cn(buttonVariants())}
          disabled={isAccepting}
          onClick={() => void acceptInvite()}
          type="button"
        >
          {isAccepting ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : null}
          Accept invite
        </button>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          Home
        </Link>
      </div>
      {error ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
