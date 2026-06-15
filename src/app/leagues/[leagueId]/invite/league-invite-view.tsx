"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Link2,
  Mail,
  MessageSquare,
  Users,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import {
  type OnboardingPanelError,
  onboardingPanelError,
  postJson,
} from "@/app/onboarding/client-http";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LeagueInviteTarget {
  displayName: string;
  fantasyMemberId: string;
  providerMemberId: string;
  providerTeamIds: string[];
  suggestedChannel: "share" | "sms" | "email";
  teamNames: string[];
}

interface LeagueInviteSummary {
  league: {
    id: string;
    name: string;
    provider: string;
    providerLeagueId: string;
    season: number;
  };
  targets: LeagueInviteTarget[];
  totals: {
    importedMembers: number;
    inviteTargets: number;
  };
}

interface CreatedInvite {
  channel: "share" | "sms" | "email";
  expiresAt: string;
  inviteUrl: string;
  target: LeagueInviteTarget;
  targetHint: string | null;
  token: string;
}

function targetKey(target: LeagueInviteTarget): string {
  return target.providerMemberId;
}

function resultKey(
  target: LeagueInviteTarget,
  channel: CreatedInvite["channel"],
) {
  return `${target.providerMemberId}:${channel}`;
}

function teamLabel(target: LeagueInviteTarget): string {
  return target.teamNames.length > 0
    ? target.teamNames.join(", ")
    : "No active team matched";
}

function suggestedChannelLabel(target: LeagueInviteTarget): string {
  switch (target.suggestedChannel) {
    case "email":
      return "Suggested: email";
    case "sms":
      return "Suggested: SMS";
    case "share":
      return "Suggested: link";
  }
}

export function LeagueInviteView({
  initialSummary,
}: {
  initialSummary: LeagueInviteSummary;
}) {
  const [error, setError] = useState<OnboardingPanelError | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [emailInputs, setEmailInputs] = useState<Record<string, string>>({});
  const [smsInputs, setSmsInputs] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, CreatedInvite>>({});
  const apiUrl = `/api/leagues/${initialSummary.league.id}/invites`;

  const heading = useMemo(
    () =>
      `Invite ${initialSummary.totals.inviteTargets} leaguemate${
        initialSummary.totals.inviteTargets > 1 ? "s" : ""
      }`,
    [initialSummary.totals.inviteTargets],
  );

  async function createInvite({
    channel,
    destination,
    target,
  }: {
    channel: CreatedInvite["channel"];
    destination?: string;
    target: LeagueInviteTarget;
  }) {
    const key = resultKey(target, channel);
    setBusyKey(key);
    setError(null);
    try {
      const invite = await postJson<CreatedInvite>(apiUrl, {
        channel,
        ...(destination ? { destination } : {}),
        providerMemberId: target.providerMemberId,
      });
      setResults((current) => ({ ...current, [key]: invite }));
      if (channel === "email") {
        setEmailInputs((current) => ({ ...current, [targetKey(target)]: "" }));
      }
      if (channel === "sms") {
        setSmsInputs((current) => ({ ...current, [targetKey(target)]: "" }));
      }
      return invite;
    } catch (cause) {
      setError(onboardingPanelError(cause));
      return null;
    } finally {
      setBusyKey(null);
    }
  }

  async function copyInvite(url: string) {
    await navigator.clipboard?.writeText(url);
  }

  async function createShareLink(target: LeagueInviteTarget) {
    const invite = await createInvite({ channel: "share", target });
    if (invite) {
      await copyInvite(invite.inviteUrl);
    }
  }

  async function sendEmail(
    event: FormEvent<HTMLFormElement>,
    target: LeagueInviteTarget,
  ) {
    event.preventDefault();
    const destination = emailInputs[targetKey(target)]?.trim();
    await createInvite({ channel: "email", destination, target });
  }

  async function sendSms(
    event: FormEvent<HTMLFormElement>,
    target: LeagueInviteTarget,
  ) {
    event.preventDefault();
    const destination = smsInputs[targetKey(target)]?.trim();
    await createInvite({ channel: "sms", destination, target });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="grid gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-primary">
              Members / Settings
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
              {initialSummary.league.name}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {initialSummary.totals.importedMembers} imported managers ·{" "}
              {initialSummary.league.season}
            </p>
          </div>
          <Users className="mt-1 size-6 shrink-0 text-primary" aria-hidden />
        </div>
        <div className="rounded-control border border-border bg-muted/30 px-3 py-2">
          <h2 className="text-base font-semibold">{heading}</h2>
        </div>
      </header>

      {error ? (
        <div className="rounded-card border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </div>
      ) : null}

      {initialSummary.targets.length > 0 ? (
        <section className="grid gap-3">
          {initialSummary.targets.map((target) => {
            const key = targetKey(target);
            const share = results[resultKey(target, "share")];
            const email = results[resultKey(target, "email")];
            const sms = results[resultKey(target, "sms")];
            return (
              <article
                key={key}
                className="rounded-card border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold">
                      {target.displayName}
                    </h3>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {teamLabel(target)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {suggestedChannelLabel(target)}
                    </p>
                  </div>
                  {share || email || sms ? (
                    <CheckCircle2
                      className="mt-1 size-5 shrink-0 text-positive"
                      aria-label="Invite created"
                    />
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void createShareLink(target)}
                      disabled={busyKey !== null}
                    >
                      <Link2 data-icon="inline-start" />
                      Link
                    </Button>
                    {share ? (
                      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] overflow-hidden rounded-control border border-border bg-background">
                        <input
                          readOnly
                          value={share.inviteUrl}
                          className="min-h-10 min-w-0 bg-transparent px-3 text-sm outline-none"
                          aria-label={`Invite link for ${target.displayName}`}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => void copyInvite(share.inviteUrl)}
                          aria-label={`Copy invite link for ${target.displayName}`}
                        >
                          <Copy />
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  <form
                    onSubmit={(event) => void sendSms(event, target)}
                    className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <label className="grid gap-1 text-sm font-medium">
                      SMS
                      <input
                        type="tel"
                        value={smsInputs[key] ?? ""}
                        onChange={(event) =>
                          setSmsInputs((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                        className="min-h-11 rounded-control border border-input bg-background px-3 text-base outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                        placeholder="+15551234567"
                      />
                    </label>
                    <Button
                      type="submit"
                      className="self-end"
                      disabled={busyKey !== null}
                    >
                      <MessageSquare data-icon="inline-start" />
                      Send SMS
                    </Button>
                  </form>
                  {sms ? (
                    <p className="text-xs text-muted-foreground">
                      SMS recorded for {sms.targetHint}.
                    </p>
                  ) : null}

                  <form
                    onSubmit={(event) => void sendEmail(event, target)}
                    className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <label className="grid gap-1 text-sm font-medium">
                      Email
                      <input
                        type="email"
                        value={emailInputs[key] ?? ""}
                        onChange={(event) =>
                          setEmailInputs((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                        className="min-h-11 rounded-control border border-input bg-background px-3 text-base outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                        placeholder="manager@example.com"
                      />
                    </label>
                    <Button
                      type="submit"
                      className="self-end"
                      disabled={busyKey !== null}
                    >
                      <Mail data-icon="inline-start" />
                      Send email
                    </Button>
                  </form>
                  {email ? (
                    <p className="text-xs text-muted-foreground">
                      Email recorded for {email.targetHint}.
                    </p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <p className="rounded-card border border-dashed border-border bg-muted/25 px-3 py-3 text-sm text-muted-foreground">
          No other imported leaguemates are available to invite.
        </p>
      )}

      <div className="flex justify-end">
        <Link
          href={`/leagues/${initialSummary.league.id}`}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          <ArrowLeft data-icon="inline-start" />
          League home
        </Link>
      </div>
    </main>
  );
}
