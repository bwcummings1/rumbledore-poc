"use client";

import { ArrowRight, CheckCircle2, CircleDot } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
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
      <section className="panel grid gap-3 p-4">
        <div className="grid gap-1">
          <p className="eyebrow text-primary">Claim requires an account</p>
          <h2 className="font-display text-base font-medium text-foreground">
            Sign in, then come back to this exact team.
          </h2>
          <p className="text-sm text-muted-foreground">
            The invite link stays attached to this league and team claim through
            onboarding.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 max-sm:grid">
          <Link href={onboardingUrl} className={cn(buttonVariants())}>
            Connect fantasy account
            <ArrowRight data-icon="inline-end" />
          </Link>
          <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
            Home
          </Link>
        </div>
      </section>
    );
  }

  const hasOpenTargets = isOpenMode && claimTargets.length > 0;

  return (
    <section className="panel grid gap-4 p-4">
      {isOpenMode ? (
        hasOpenTargets ? (
          <fieldset className="grid gap-2">
            <legend className="font-display text-sm font-medium text-foreground">
              Choose your team
            </legend>
            <div className="grid gap-2">
              {claimTargets.map((target) => {
                const isSelected =
                  selectedProviderMemberId === target.providerMemberId;
                return (
                  <label
                    key={target.providerMemberId}
                    className={cn(
                      "cell grid min-h-11 cursor-pointer gap-1 px-3 py-3 text-sm outline-none transition-[border-color,box-shadow]",
                      isSelected
                        ? "border-primary bg-primary/10 shadow-[0_0_18px_var(--glow-lilac),var(--bevel)]"
                        : "",
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
                        className="mt-1 size-5 accent-primary"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-display text-sm font-medium text-foreground">
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
          <Alert
            tone="warn"
            title="Every imported team has already been claimed."
          >
            Ask your commissioner for a fresh targeted invite if this looks
            wrong.
          </Alert>
        )
      ) : null}
      <div className="flex flex-wrap gap-2 max-sm:grid">
        <Button
          disabled={isAccepting || (isOpenMode && !hasOpenTargets)}
          loading={isAccepting}
          onClick={() => void acceptInvite()}
          type="button"
        >
          {isAccepting ? null : <CheckCircle2 data-icon="inline-start" />}
          {isOpenMode ? "Claim team" : "Accept invite"}
        </Button>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          Home
        </Link>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CircleDot aria-hidden="true" className="size-3.5 text-primary" />
        Claiming maps your account to the imported provider member and opens the
        league home with your team waiting.
      </p>
      {error ? (
        <p
          className="rounded-control border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
