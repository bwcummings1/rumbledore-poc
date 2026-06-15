"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Link2,
  Mail,
  MessageSquare,
  ShieldCheck,
  UserCheck,
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

interface DataStewardCandidate {
  displayName: string;
  email: string;
  isDataSteward: boolean;
  memberId: string;
  role: "member" | "data_steward" | "league_admin" | "commissioner";
  userId: string;
}

interface DataStewardReviewDoorway {
  href: string;
  latestFailureAt: string | null;
  needsReview: boolean;
  suggestedIdentityLinks: number;
  unresolvedIntegrityChecks: number;
}

interface DataStewardDoorwaySummary {
  canAssignStewards: boolean;
  canOpenReview: boolean;
  review: DataStewardReviewDoorway | null;
  stewardCandidates: DataStewardCandidate[];
}

interface AssignedDataSteward {
  steward: DataStewardCandidate;
}

interface CreatedInvite {
  channel: "share" | "sms" | "email";
  expiresAt: string;
  inviteUrl: string;
  target: LeagueInviteTarget | null;
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
      return "Email address available";
    case "sms":
      return "Start with SMS";
    case "share":
      return "Start with a link";
  }
}

function reviewStatusText(review: DataStewardReviewDoorway | null): string {
  if (!review) {
    return "Data review is ready for appointed stewards.";
  }
  if (!review.needsReview) {
    return "No ambiguous identities or failed checks are waiting.";
  }

  const parts: string[] = [];
  if (review.suggestedIdentityLinks > 0) {
    parts.push(
      `${review.suggestedIdentityLinks} suggested identity link${
        review.suggestedIdentityLinks === 1 ? "" : "s"
      }`,
    );
  }
  if (review.unresolvedIntegrityChecks > 0) {
    parts.push(
      `${review.unresolvedIntegrityChecks} integrity flag${
        review.unresolvedIntegrityChecks === 1 ? "" : "s"
      }`,
    );
  }
  return parts.join(" · ");
}

function isAssignedStewardCandidate(
  existing: DataStewardCandidate,
  assigned: DataStewardCandidate,
): boolean {
  switch (existing.memberId) {
    case assigned.memberId:
      return true;
    default:
      return false;
  }
}

function DataStewardDoorwayCard({
  busyKey,
  doorway,
  onAssign,
}: {
  busyKey: string | null;
  doorway: DataStewardDoorwaySummary;
  onAssign: (candidate: DataStewardCandidate) => Promise<void>;
}) {
  if (!doorway.canAssignStewards && !doorway.canOpenReview) {
    return null;
  }

  return (
    <section className="grid gap-4 rounded-card border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden />
            Data steward doorway
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {reviewStatusText(doorway.review)}
          </p>
        </div>
        {doorway.review?.needsReview ? (
          <AlertTriangle className="size-5 text-highlight" aria-hidden />
        ) : (
          <CheckCircle2 className="size-5 text-positive" aria-hidden />
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {doorway.canOpenReview && doorway.review ? (
          <Link
            href={doorway.review.href}
            className={cn(buttonVariants({ variant: "secondary" }))}
          >
            <ShieldCheck data-icon="inline-start" />
            Open data review
          </Link>
        ) : null}
        {doorway.review?.latestFailureAt ? (
          <p className="self-center text-xs text-muted-foreground">
            Latest flag{" "}
            {new Date(doorway.review.latestFailureAt).toLocaleString()}
          </p>
        ) : null}
      </div>

      {doorway.canAssignStewards ? (
        <div className="grid gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            Appoint a league data steward
          </p>
          {doorway.stewardCandidates.length > 0 ? (
            <div className="grid gap-2">
              {doorway.stewardCandidates.map((candidate) => (
                <div
                  key={candidate.memberId}
                  className="grid gap-2 rounded-control border border-border bg-background px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {candidate.displayName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {candidate.email}
                    </p>
                  </div>
                  {candidate.isDataSteward ? (
                    <span className="inline-flex h-8 items-center justify-center rounded-control border border-positive/30 px-2 text-xs font-medium text-positive">
                      Data steward
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void onAssign(candidate)}
                      disabled={busyKey !== null}
                    >
                      <UserCheck data-icon="inline-start" />
                      Make steward
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-control border border-dashed border-border bg-muted/25 px-3 py-3 text-sm text-muted-foreground">
              No regular members are available to appoint yet.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

export function LeagueInviteView({
  initialSummary,
  stewardDoorway,
}: {
  initialSummary: LeagueInviteSummary;
  stewardDoorway?: DataStewardDoorwaySummary;
}) {
  const [error, setError] = useState<OnboardingPanelError | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [emailFallbackOpen, setEmailFallbackOpen] = useState<
    Record<string, boolean>
  >({});
  const [emailInputs, setEmailInputs] = useState<Record<string, string>>({});
  const [smsInputs, setSmsInputs] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, CreatedInvite>>({});
  const [openInvite, setOpenInvite] = useState<CreatedInvite | null>(null);
  const [rosterLinksCopied, setRosterLinksCopied] = useState(false);
  const [stewardDoorwayState, setStewardDoorwayState] =
    useState(stewardDoorway);
  const apiUrl = `/api/leagues/${initialSummary.league.id}/invites`;
  const stewardApiUrl = `/api/leagues/${initialSummary.league.id}/stewards`;

  const heading = useMemo(
    () =>
      `We found ${initialSummary.totals.inviteTargets} leaguemate${
        initialSummary.totals.inviteTargets > 1 ? "s" : ""
      }`,
    [initialSummary.totals.inviteTargets],
  );

  async function requestInvite({
    channel,
    destination,
    target,
  }: {
    channel: CreatedInvite["channel"];
    destination?: string;
    target: LeagueInviteTarget;
  }) {
    const invite = await postJson<CreatedInvite>(apiUrl, {
      channel,
      ...(destination ? { destination } : {}),
      providerMemberId: target.providerMemberId,
    });
    setResults((current) => ({
      ...current,
      [resultKey(target, channel)]: invite,
    }));
    if (channel === "email") {
      setEmailInputs((current) => ({ ...current, [targetKey(target)]: "" }));
    }
    if (channel === "sms") {
      setSmsInputs((current) => ({ ...current, [targetKey(target)]: "" }));
    }
    return invite;
  }

  async function createInvite(input: {
    channel: CreatedInvite["channel"];
    destination?: string;
    target: LeagueInviteTarget;
  }) {
    const key = resultKey(input.target, input.channel);
    setBusyKey(key);
    setError(null);
    setRosterLinksCopied(false);
    try {
      return await requestInvite(input);
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

  async function copyRosterLinks() {
    const busy = "roster:share";
    setBusyKey(busy);
    setError(null);
    setRosterLinksCopied(false);
    try {
      const lines: string[] = [];
      for (const target of initialSummary.targets) {
        const existing = results[resultKey(target, "share")];
        const invite =
          existing ?? (await requestInvite({ channel: "share", target }));
        lines.push(`${target.displayName}: ${invite.inviteUrl}`);
      }
      await copyInvite(lines.join("\n"));
      setRosterLinksCopied(true);
    } catch (cause) {
      setError(onboardingPanelError(cause));
    } finally {
      setBusyKey(null);
    }
  }

  async function copyOpenInviteLink() {
    const busy = "league:share";
    setBusyKey(busy);
    setError(null);
    setRosterLinksCopied(false);
    try {
      const invite =
        openInvite ??
        (await postJson<CreatedInvite>(apiUrl, {
          channel: "share",
        }));
      setOpenInvite(invite);
      await copyInvite(invite.inviteUrl);
    } catch (cause) {
      setError(onboardingPanelError(cause));
    } finally {
      setBusyKey(null);
    }
  }

  async function assignSteward(candidate: DataStewardCandidate) {
    const busy = `steward:${candidate.memberId}`;
    setBusyKey(busy);
    setError(null);
    try {
      const assigned = await postJson<AssignedDataSteward>(stewardApiUrl, {
        memberId: candidate.memberId,
      });
      setStewardDoorwayState((current) =>
        current
          ? {
              ...current,
              stewardCandidates: current.stewardCandidates.map((existing) =>
                isAssignedStewardCandidate(existing, assigned.steward)
                  ? assigned.steward
                  : existing,
              ),
            }
          : current,
      );
    } catch (cause) {
      setError(onboardingPanelError(cause));
    } finally {
      setBusyKey(null);
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
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-muted/30 px-3 py-2">
          <h2 className="text-base font-semibold">{heading}</h2>
          {initialSummary.targets.length > 0 ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void copyOpenInviteLink()}
                disabled={busyKey !== null}
              >
                <Link2 data-icon="inline-start" />
                Copy claim link
              </Button>
              {rosterLinksCopied ? (
                <p className="text-xs font-medium text-positive">
                  Roster links copied.
                </p>
              ) : null}
              {initialSummary.targets.length > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void copyRosterLinks()}
                  disabled={busyKey !== null}
                >
                  <Copy data-icon="inline-start" />
                  Copy roster links
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {openInvite ? (
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] overflow-hidden rounded-control border border-border bg-background">
            <input
              readOnly
              value={openInvite.inviteUrl}
              className="min-h-10 min-w-0 bg-transparent px-3 text-sm outline-none"
              aria-label="League claim link"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => void copyInvite(openInvite.inviteUrl)}
              aria-label="Copy league claim link"
            >
              <Copy />
            </Button>
          </div>
        ) : null}
      </header>

      {error ? (
        <div className="rounded-card border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </div>
      ) : null}

      {stewardDoorwayState ? (
        <DataStewardDoorwayCard
          busyKey={busyKey}
          doorway={stewardDoorwayState}
          onAssign={assignSteward}
        />
      ) : null}

      {initialSummary.targets.length > 0 ? (
        <section className="grid gap-3">
          {initialSummary.targets.map((target) => {
            const key = targetKey(target);
            const share = results[resultKey(target, "share")];
            const email = results[resultKey(target, "email")];
            const sms = results[resultKey(target, "sms")];
            const showEmailFallback =
              emailFallbackOpen[key] || target.suggestedChannel === "email";
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
                      Copy link
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

                  <div className="rounded-control border border-dashed border-border bg-muted/20 px-3 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setEmailFallbackOpen((current) => ({
                          ...current,
                          [key]: !showEmailFallback,
                        }))
                      }
                    >
                      <Mail data-icon="inline-start" />
                      Email address
                    </Button>
                    {showEmailFallback ? (
                      <form
                        onSubmit={(event) => void sendEmail(event, target)}
                        className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
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
                    ) : null}
                    {email ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Email recorded for {email.targetHint}.
                      </p>
                    ) : null}
                  </div>
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
