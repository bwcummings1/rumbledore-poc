import {
  ArrowRight,
  Crown,
  GitBranch,
  MessageSquareText,
  Swords,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { type AiPersona, DEFAULT_PERSONA_CARDS } from "@/ai/personas";
import {
  CastAiBadge,
  CastPersonaByline,
  CastPersonaOrb,
} from "@/components/cast/cast-presence";
import { buttonVariants } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/utils";
import type { LoreClaimCard, LoreInstigationSummary } from "@/lore/member-ui";

const kindCopy = {
  manufactured_rivalry: {
    Icon: Swords,
    cta: "Make it a rivalry",
    label: "Manufactured rivalry",
    title: "The cast is manufacturing a rivalry",
  },
  settle_it_poll: {
    Icon: MessageSquareText,
    cta: "Settle it",
    label: "Settle-it poll",
    title: "The cast opened a debate",
  },
  user_move_reaction: {
    Icon: ArrowRight,
    cta: "Reply in thread",
    label: "Move reaction",
    title: "The cast is needling a move",
  },
  villain_crown: {
    Icon: Crown,
    cta: "Crown the villain",
    label: "Villain crown",
    title: "The cast wants a villain",
  },
} satisfies Record<
  LoreInstigationSummary["kind"],
  {
    Icon: typeof MessageSquareText;
    cta: string;
    label: string;
    title: string;
  }
>;

function personaCard(persona: AiPersona) {
  return DEFAULT_PERSONA_CARDS[persona];
}

function claimHref(leagueId: string, claimId: string) {
  return `/leagues/${encodeURIComponent(leagueId)}/lore/${encodeURIComponent(claimId)}`;
}

function twoSides(instigation: LoreInstigationSummary, claim: LoreClaimCard) {
  if (instigation.options.length > 0) {
    return instigation.options.slice(0, 4);
  }
  if (claim.subjects.length > 0) {
    return claim.subjects.map((subject) => subject.label).slice(0, 4);
  }
  return ["Affirm the claim", "Reject the claim"];
}

function InstigatorByline({
  instigation,
  state = "speaking",
}: {
  readonly instigation: LoreInstigationSummary;
  readonly state?: "idle" | "muted" | "speaking" | "think";
}) {
  const card = personaCard(instigation.persona);
  return (
    <CastPersonaByline
      beat={card.beat}
      name={card.name}
      persona={instigation.persona}
      state={state}
    />
  );
}

function InstigatorProvocationCard({
  children,
  claim,
  className,
  leagueId,
}: {
  readonly children?: ReactNode;
  readonly claim: LoreClaimCard;
  readonly className?: string;
  readonly leagueId: string;
}) {
  const instigation = claim.instigation;
  if (!instigation) {
    return null;
  }
  const copy = kindCopy[instigation.kind];
  const sides = twoSides(instigation, claim);
  const Icon = copy.Icon;

  return (
    <article
      className={cn("insight panel grid gap-4 p-4", className)}
      data-instigation-kind={instigation.kind}
      data-slot="instigator-provocation-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <InstigatorByline instigation={instigation} />
        <StatusPill icon={<Icon />} showDot={false} tone="live" variant="soft">
          {copy.label}
        </StatusPill>
      </div>

      <div className="grid gap-2">
        <p className="eyebrow text-primary">{copy.title}</p>
        <h2 className="heading-auspex text-lg leading-snug">
          {instigation.promptText || claim.title}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {claim.bodyPreview}
        </p>
      </div>

      <div className="grid gap-2">
        <p className="metric text-xs text-muted-foreground">The two sides</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {sides.map((side) => (
            <div className="cell min-h-11 p-3 text-sm" key={side}>
              {side}
            </div>
          ))}
        </div>
      </div>

      {instigation.groundingRefs.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {instigation.groundingRefs.slice(0, 4).map((ref) => (
            <Tag key={`${ref.type}:${ref.id}`}>
              {ref.label ?? `${ref.type}: ${ref.id}`}
            </Tag>
          ))}
        </div>
      ) : null}

      {children}

      <Link
        className={cn(
          buttonVariants({ className: "w-fit", variant: "outline" }),
        )}
        href={claimHref(leagueId, claim.id)}
      >
        {copy.cta}
        <ArrowRight data-icon="inline-end" />
      </Link>
    </article>
  );
}

function InstigatorVerdictCard({
  claim,
  className,
  leagueId,
}: {
  readonly claim: LoreClaimCard;
  readonly className?: string;
  readonly leagueId: string;
}) {
  const instigation = claim.instigation;
  if (!instigation || claim.status !== "canon") {
    return null;
  }

  const poll = instigation.poll;
  const winningOption =
    poll?.winningOptionIdx === null || poll?.winningOptionIdx === undefined
      ? null
      : poll.options[poll.winningOptionIdx]?.label;

  return (
    <article
      className={cn("panel grid gap-4 p-4", className)}
      data-slot="instigator-verdict-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <CastPersonaOrb
            label="AI cast verdict"
            persona={instigation.persona}
            size="md"
            state="speaking"
          />
          <div>
            <p className="eyebrow text-primary">Verdict column</p>
            <h2 className="font-display text-base font-medium text-foreground">
              The league has spoken
            </h2>
          </div>
        </div>
        <CastAiBadge />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="cell p-3">
          <p className="metric text-xs text-muted-foreground">Question</p>
          <p className="mt-1 text-sm text-foreground">
            {poll?.question ?? instigation.promptText}
          </p>
        </div>
        <div className="cell p-3">
          <p className="metric text-xs text-muted-foreground">Vote</p>
          <p className="mt-1 text-sm text-foreground">
            {winningOption
              ? `${winningOption} won${poll ? ` with ${poll.totalVotes} total votes` : ""}.`
              : "The cast verdict is recorded from league vote history."}
          </p>
        </div>
      </div>

      <div className="cell p-3">
        <p className="metric text-xs text-muted-foreground">New canon</p>
        <p className="mt-1 text-sm leading-6 text-foreground">
          {claim.bodyPreview || claim.title}
        </p>
      </div>

      <Link
        className={cn(
          buttonVariants({ className: "w-fit", variant: "outline" }),
        )}
        href={claimHref(leagueId, claim.id)}
      >
        Open canon claim
        <GitBranch data-icon="inline-end" />
      </Link>
    </article>
  );
}

export { InstigatorProvocationCard, InstigatorVerdictCard };
