"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface InviteAcceptPanelProps {
  acceptUrl: string;
  claimMode: "targeted" | "open";
  claimTargets: ClaimTarget[];
  isAuthenticated: boolean;
  onboardingUrl: string;
}

interface ClaimTarget {
  displayName: string;
  providerMemberId: string;
  teamNames: string[];
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
  if (status === 400) {
    return "Choose your team before accepting this invite.";
  }
  return "This invite could not be accepted.";
}

function teamLabel(target: ClaimTarget): string {
  return target.teamNames.length > 0
    ? target.teamNames.join(", ")
    : "Team match pending";
}

function isOpenClaimMode(mode: InviteAcceptPanelProps["claimMode"]): boolean {
  switch (mode) {
    case "open":
      return true;
    case "targeted":
      return false;
  }
}

export function InviteAcceptPanel({
  acceptUrl,
  claimMode,
  claimTargets,
  isAuthenticated,
  onboardingUrl,
}: InviteAcceptPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [selectedProviderMemberId, setSelectedProviderMemberId] = useState(
    claimTargets[0]?.providerMemberId ?? "",
  );
  const isOpenMode = isOpenClaimMode(claimMode);

  async function acceptInvite() {
    setError(null);
    setIsAccepting(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    const body = isOpenMode
      ? JSON.stringify({ providerMemberId: selectedProviderMemberId })
      : undefined;
    try {
      const response = await fetch(acceptUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body } : {}),
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

  const hasOpenTargets = isOpenMode && claimTargets.length > 0;

  return (
    <div className="grid gap-3">
      {isOpenMode ? (
        hasOpenTargets ? (
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Choose your team</legend>
            <div className="grid gap-2">
              {claimTargets.map((target) => {
                const isSelected =
                  selectedProviderMemberId === target.providerMemberId;
                return (
                  <label
                    key={target.providerMemberId}
                    className={cn(
                      "grid cursor-pointer gap-1 rounded-control border px-3 py-2 text-sm transition-colors",
                      isSelected
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card",
                    )}
                  >
                    <span className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="providerMemberId"
                        value={target.providerMemberId}
                        checked={isSelected}
                        onChange={(event) =>
                          setSelectedProviderMemberId(event.target.value)
                        }
                        className="mt-1"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {teamLabel(target)}
                        </span>
                        <span className="block truncate text-muted-foreground">
                          {target.displayName}
                        </span>
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : (
          <p className="rounded-card border border-dashed border-border bg-muted/25 px-3 py-3 text-sm text-muted-foreground">
            Every imported team has already been claimed.
          </p>
        )
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          className={cn(buttonVariants())}
          disabled={isAccepting || (isOpenMode && !hasOpenTargets)}
          onClick={() => void acceptInvite()}
          type="button"
        >
          {isAccepting ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : null}
          {isOpenMode ? "Claim team" : "Accept invite"}
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
