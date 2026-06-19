"use client";

import {
  ArrowLeft,
  Check,
  FilePlus2,
  GitBranch,
  Landmark,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { DEFAULT_PERSONA_CARDS } from "@/ai/personas";
import { onboardingPanelError, postJson } from "@/app/onboarding/client-http";
import {
  CastAiBadge,
  CastPersonaByline,
} from "@/components/cast/cast-presence";
import {
  InstigatorProvocationCard,
  InstigatorVerdictCard,
} from "@/components/lore/instigator-ui";
import { LoreVoteWidget } from "@/components/lore/lore-vote-widget";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { StatusPill } from "@/components/ui/status-pill";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { LoreClaimRelation, StewardLoreAction } from "@/lore";
import type {
  LoreClaimAuthorSummary,
  LoreClaimCard,
  LoreClaimDetailData,
  LoreClaimSubmitResponse,
  LoreStewardActionResponse,
} from "@/lore/member-ui";

function formatDateTime(value: string | null): string {
  if (!value) {
    return "No close time set";
  }
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function statusLabel(claim: LoreClaimCard): string {
  switch (claim.status) {
    case "canon":
      switch (claim.ratifiedBy) {
        case "verified":
          return "Canon · on the record";
        case "steward":
          return "Canon · steward ratified";
        case "vote":
        case null:
          return "Canon · league decided";
      }
      return "Canon";
    case "disputed":
      return "Canon under challenge";
    case "pending":
      return "Pending";
    case "rejected":
      switch (claim.verification) {
        case "refuted":
          return "Refuted";
        default:
          return "Rejected";
      }
    case "superseded":
      return "Superseded";
    case "vote":
      return "Open vote";
    case "withdrawn":
      return "Withdrawn";
  }
}

function statusClass(status: LoreClaimCard["status"]): string {
  switch (status) {
    case "canon":
      return "border-positive/40 bg-positive/10 text-positive";
    case "vote":
      return "border-primary/40 bg-primary/10 text-primary";
    case "disputed":
    case "pending":
      return "border-highlight/40 bg-highlight/10 text-highlight";
    case "rejected":
    case "superseded":
    case "withdrawn":
      return "border-destructive/40 bg-destructive/10 text-destructive";
  }
}

function relationLabel(relation: LoreClaimCard["relation"]): string {
  switch (relation) {
    case "addendum":
      return "Addendum";
    case "dispute":
      return "Dispute";
    case "relitigation":
      return "Relitigation";
    case "response":
      return "Response";
    case "root":
      return "Original claim";
  }
}

function isChallenge(claim: LoreClaimCard): boolean {
  return claim.relation === "dispute" || claim.relation === "relitigation";
}

type BranchRelation = Extract<
  LoreClaimRelation,
  "addendum" | "dispute" | "relitigation" | "response"
>;

const ADDITIVE_BRANCH_OPTIONS: Array<{
  description: string;
  label: string;
  relation: BranchRelation;
}> = [
  {
    description: "A reply that keeps the current claim in place.",
    label: "Response",
    relation: "response",
  },
  {
    description: "Extra context or correction that does not replace canon.",
    label: "Addendum",
    relation: "addendum",
  },
];

const CHALLENGE_BRANCH_OPTIONS: Array<{
  description: string;
  label: string;
  relation: BranchRelation;
}> = [
  {
    description: "Open a vote that can supersede this canon if it passes.",
    label: "Challenge (dispute)",
    relation: "dispute",
  },
  {
    description: "Reopen the league argument with a replacement claim.",
    label: "Re-litigation",
    relation: "relitigation",
  },
];

function branchRelationOptions(status: LoreClaimCard["status"]) {
  return status === "canon"
    ? [...ADDITIVE_BRANCH_OPTIONS, ...CHALLENGE_BRANCH_OPTIONS]
    : ADDITIVE_BRANCH_OPTIONS;
}

function isCanonStatus(status: LoreClaimCard["status"]): boolean {
  switch (status) {
    case "canon":
      return true;
    default:
      return false;
  }
}

function branchSubmitLabel(relation: BranchRelation): string {
  switch (relation) {
    case "dispute":
    case "relitigation":
      return "Open challenge";
    case "addendum":
    case "response":
      return "Add to this";
  }
}

function branchSuccessMessage({
  relation,
  result,
}: {
  relation: BranchRelation;
  result: LoreClaimSubmitResponse;
}): string {
  if (relation === "dispute" || relation === "relitigation") {
    return "Challenge opened. This canon is now marked under challenge.";
  }
  switch (result.status) {
    case "canonized":
      return "Branch posted as verified canon.";
    case "rejected":
      return "Branch posted and refuted against imported records.";
    case "vote":
      return "Branch opened for a league vote.";
  }
}

interface ThreadNode {
  readonly children: ThreadNode[];
  readonly claim: LoreClaimCard;
}

function buildThreadTree(claims: readonly LoreClaimCard[]): ThreadNode[] {
  const nodesById = new Map<string, ThreadNode>();
  for (const claim of claims) {
    nodesById.set(claim.id, { children: [], claim });
  }
  const roots: ThreadNode[] = [];

  for (const node of nodesById.values()) {
    if (node.claim.branchOf) {
      const parent = nodesById.get(node.claim.branchOf);
      if (parent) {
        parent.children.push(node);
        continue;
      }
    }
    roots.push(node);
  }

  return roots;
}

function lineageAnnotation(
  node: ThreadNode,
  allClaims: readonly LoreClaimCard[],
): string | null {
  if (node.claim.status === "superseded") {
    const replacement = allClaims.find(
      (claim) =>
        claim.branchOf === node.claim.id &&
        isChallenge(claim) &&
        claim.status === "canon",
    );
    return replacement ? `Superseded by -> ${replacement.title}` : "Superseded";
  }
  if (
    node.claim.status === "canon" &&
    allClaims.some(
      (claim) =>
        claim.branchOf === node.claim.id &&
        isChallenge(claim) &&
        claim.status === "rejected",
    )
  ) {
    return "Challenged and upheld";
  }
  if (node.claim.status === "disputed") {
    return "Challenge open.";
  }
  return null;
}

function LoreAuthorByline({
  author,
}: {
  readonly author: LoreClaimAuthorSummary;
}) {
  if (author.isAi && author.persona) {
    const card = DEFAULT_PERSONA_CARDS[author.persona];
    return (
      <CastPersonaByline
        beat={card.beat}
        name={card.name}
        persona={author.persona}
        state="speaking"
      />
    );
  }

  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <span>By {author.displayName}</span>
      {author.isAi ? <CastAiBadge /> : null}
    </p>
  );
}

function ThreadNodeView({
  allClaims,
  level = 1,
  leagueId,
  node,
  parentTitle,
  selectedClaimId,
}: {
  allClaims: readonly LoreClaimCard[];
  level?: number;
  leagueId: string;
  node: ThreadNode;
  parentTitle?: string;
  selectedClaimId: string;
}) {
  const annotation = lineageAnnotation(node, allClaims);
  const isSelected = node.claim.id === selectedClaimId;

  return (
    <li className="grid gap-3" data-level={level}>
      <article
        className={cn(
          "cell grid gap-3 p-4",
          isSelected &&
            "border-primary/50 shadow-[0_0_18px_var(--glow-lilac),var(--bevel)]",
        )}
        data-selected={isSelected ? "true" : "false"}
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill showDot={false} tone="neutral">
            {relationLabel(node.claim.relation)}
          </StatusPill>
          <span
            className={cn(
              "rounded-full border px-2 py-1 text-xs font-medium",
              statusClass(node.claim.status),
            )}
          >
            {statusLabel(node.claim)}
          </span>
          {annotation ? (
            <StatusPill showDot={false} tone="warning">
              {annotation}
            </StatusPill>
          ) : null}
          {level > 3 && parentTitle ? (
            <StatusPill showDot={false} tone="neutral">
              Nested in {parentTitle}
            </StatusPill>
          ) : null}
        </div>
        <h3 className="font-display text-base font-medium text-foreground">
          <Link
            href={`/leagues/${encodeURIComponent(leagueId)}/lore/${encodeURIComponent(node.claim.id)}`}
            className="hover:text-primary focus-visible:shadow-[var(--focus-ring-shadow)] focus-visible:outline-none"
          >
            {node.claim.title}
          </Link>
        </h3>
        <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
          {node.claim.bodyPreview}
        </p>
        <LoreAuthorByline author={node.claim.author} />
      </article>

      {node.children.length > 0 ? (
        <ol
          className={cn(
            "grid gap-3 border-l border-[var(--hair)] pl-3",
            level < 3 ? "ml-3 sm:ml-5 sm:pl-5" : "ml-0 border-dashed",
          )}
        >
          {node.children.map((child) => (
            <ThreadNodeView
              allClaims={allClaims}
              key={child.claim.id}
              level={level + 1}
              leagueId={leagueId}
              node={child}
              parentTitle={node.claim.title}
              selectedClaimId={selectedClaimId}
            />
          ))}
        </ol>
      ) : null}
    </li>
  );
}

function StewardControls({
  claim,
  onAction,
}: {
  claim: LoreClaimCard;
  onAction: (action: StewardLoreAction, reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busyAction, setBusyAction] = useState<StewardLoreAction | null>(null);
  const actions: Array<{ action: StewardLoreAction; label: string }> =
    claim.status === "canon"
      ? [{ action: "veto", label: "Veto canon" }]
      : claim.status === "vote"
        ? [
            { action: "ratify", label: "Ratify" },
            { action: "reject", label: "Reject" },
            { action: "extend", label: "Extend once" },
          ]
        : [];

  if (actions.length === 0) {
    return null;
  }

  async function submit(action: StewardLoreAction) {
    if (!reason.trim()) {
      return;
    }
    setBusyAction(action);
    try {
      await onAction(action, reason.trim());
      setReason("");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="panel grid gap-3 p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
        <h2 className="font-display text-base font-medium text-foreground">
          Steward tiebreak
        </h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Commissioner and data-steward actions require an audited reason.
      </p>
      <Field controlId="steward-reason" label="Reason">
        {({ controlProps }) => (
          <Textarea
            {...controlProps}
            className="min-h-20 text-sm"
            maxLength={500}
            onChange={(event) => setReason(event.currentTarget.value)}
            showCount={true}
            value={reason}
          />
        )}
      </Field>
      <div className="flex flex-wrap gap-2">
        {actions.map((item) => (
          <Button
            key={item.action}
            type="button"
            variant={item.action === "veto" ? "destructive" : "secondary"}
            onClick={() => void submit(item.action)}
            disabled={!reason.trim() || busyAction !== null}
            loading={busyAction === item.action}
          >
            {item.action === "reject" || item.action === "veto" ? (
              <X data-icon="inline-start" />
            ) : (
              <Check data-icon="inline-start" />
            )}
            {item.label}
          </Button>
        ))}
      </div>
    </section>
  );
}

function BranchControls({
  claim,
  onSubmitted,
  submitApiUrl,
}: {
  claim: LoreClaimCard;
  onSubmitted: (
    result: LoreClaimSubmitResponse,
    relation: BranchRelation,
  ) => void;
  submitApiUrl: string;
}) {
  const options = branchRelationOptions(claim.status);
  const [relation, setRelation] = useState<BranchRelation>(
    options[0]?.relation ?? "response",
  );
  const selectedRelation = options.some(
    (option) => option.relation === relation,
  )
    ? relation
    : (options[0]?.relation ?? "response");
  const selectedOption = options.find(
    (option) => option.relation === selectedRelation,
  );
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = busy || !title.trim() || !body.trim();

  async function submitBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await postJson<LoreClaimSubmitResponse>(submitApiUrl, {
        body: body.trim(),
        branchOf: claim.id,
        relation: selectedRelation,
        title: title.trim(),
      });
      setTitle("");
      setBody("");
      setRelation("response");
      onSubmitted(result, selectedRelation);
    } catch (cause) {
      setError(onboardingPanelError(cause).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel grid gap-4 p-4">
      <div>
        <p className="flex items-center gap-2 font-display text-sm font-medium text-foreground">
          <GitBranch className="size-4 text-primary" aria-hidden="true" />
          Branch this lore
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Add context to any claim, or challenge canon and let the league decide
          whether the record changes.
        </p>
        {isCanonStatus(claim.status) ? null : (
          <p className="mt-2 text-xs text-muted-foreground">
            Challenge controls appear only after a claim is canon. Responses and
            addenda can still extend this thread.
          </p>
        )}
      </div>

      <form className="grid gap-3" onSubmit={submitBranch}>
        <Field controlId="branch-type" label="Branch type">
          <Segmented
            aria-label="Branch type"
            onValueChange={(nextValue) =>
              setRelation(nextValue as BranchRelation)
            }
            options={options.map((option) => ({
              label: option.label,
              value: option.relation,
            }))}
            value={selectedRelation}
          />
        </Field>
        {selectedOption ? (
          <p className="text-sm text-muted-foreground">
            {selectedOption.description}
          </p>
        ) : null}
        {error ? (
          <Alert role="alert" title="Branch could not be posted" tone="danger">
            <p>{error}</p>
          </Alert>
        ) : null}
        <Field controlId="branch-title" label="Branch title">
          {({ controlProps }) => (
            <Input
              {...controlProps}
              maxLength={160}
              onChange={(event) => setTitle(event.currentTarget.value)}
              required
              value={title}
            />
          )}
        </Field>
        <Field controlId="branch-body" label="Branch statement">
          {({ controlProps }) => (
            <Textarea
              {...controlProps}
              className="min-h-28"
              maxLength={4000}
              onChange={(event) => setBody(event.currentTarget.value)}
              required
              showCount={true}
              value={body}
            />
          )}
        </Field>
        <Button
          type="submit"
          className="w-fit"
          disabled={disabled}
          loading={busy}
          loadingLabel="Posting branch"
        >
          <FilePlus2 data-icon="inline-start" />
          {branchSubmitLabel(selectedRelation)}
        </Button>
      </form>
    </section>
  );
}

export function LeagueLoreClaimView({ data }: { data: LoreClaimDetailData }) {
  const loreHref = `/leagues/${encodeURIComponent(data.league.id)}/lore`;
  const [claim, setClaim] = useState(data.claim);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [branchResult, setBranchResult] = useState<{
    claimId: string;
    message: string;
  } | null>(null);
  const threadTree = buildThreadTree(data.thread);

  async function stewardAction(action: StewardLoreAction, reason: string) {
    setError(null);
    setMessage(null);
    setBranchResult(null);
    try {
      const response = await postJson<LoreStewardActionResponse>(
        data.stewardApiUrl,
        { action, reason },
      );
      setClaim((current) => ({ ...current, ...response.claim }));
      setMessage(`Steward action recorded: ${action}.`);
    } catch (cause) {
      setError(onboardingPanelError(cause).message);
    }
  }

  function branchSubmitted(
    result: LoreClaimSubmitResponse,
    relation: BranchRelation,
  ) {
    setError(null);
    setMessage(null);
    if (
      (relation === "dispute" || relation === "relitigation") &&
      claim.status === "canon"
    ) {
      setClaim((current) => ({ ...current, status: "disputed" }));
    }
    setBranchResult({
      claimId: result.claimId,
      message: branchSuccessMessage({ relation, result }),
    });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="grid gap-4">
        <Link
          href={loreHref}
          className={cn(
            buttonVariants({ className: "w-fit", variant: "ghost" }),
          )}
        >
          <ArrowLeft data-icon="inline-start" />
          Lore
        </Link>

        <div className="panel grid gap-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full border px-2 py-1 text-xs font-medium",
                statusClass(claim.status),
              )}
            >
              {statusLabel(claim)}
            </span>
            {claim.author.isAi && !claim.author.persona ? (
              <CastAiBadge />
            ) : null}
          </div>
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-primary">
              <Landmark className="size-4" aria-hidden="true" />
              {data.league.name} lore
            </p>
            <h1 className="mt-2 heading-auspex text-xl leading-tight">
              {claim.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <LoreAuthorByline author={claim.author} />
              <time
                className="metric text-xs text-muted-foreground"
                dateTime={claim.createdAt}
              >
                Opened {formatDateTime(claim.createdAt)}
              </time>
            </div>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-6">{claim.body}</p>
          {claim.subjects.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {claim.subjects.map((subject) => (
                <Link
                  key={subject.key}
                  href={`/leagues/${encodeURIComponent(data.league.id)}/lore?${new URLSearchParams({ subject: subject.key }).toString()}`}
                  className={cn(
                    buttonVariants({
                      className: "w-fit",
                      size: "sm",
                      variant: "outline",
                    }),
                  )}
                >
                  {subject.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      {message ? (
        <Alert title="Steward action recorded" tone="ok">
          <p>{message}</p>
        </Alert>
      ) : null}
      {branchResult ? (
        <Alert
          actions={
            <Link
              href={`/leagues/${encodeURIComponent(data.league.id)}/lore/${encodeURIComponent(branchResult.claimId)}`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Open branch
            </Link>
          }
          title="Branch posted"
          tone="ok"
        >
          <p>{branchResult.message}</p>
        </Alert>
      ) : null}
      {error ? (
        <Alert role="alert" title="Lore action failed" tone="danger">
          <p>{error}</p>
        </Alert>
      ) : null}

      {claim.instigation && claim.status === "canon" ? (
        <InstigatorVerdictCard claim={claim} leagueId={data.league.id} />
      ) : null}

      {claim.instigation && claim.status === "vote" ? (
        <InstigatorProvocationCard claim={claim} leagueId={data.league.id}>
          {claim.instigation.poll ? (
            <LoreVoteWidget mode="poll" poll={claim.instigation.poll} />
          ) : claim.vote ? (
            <LoreVoteWidget
              mode="lore"
              vote={claim.vote}
              voteApiUrl={data.voteApiUrl}
            />
          ) : null}
        </InstigatorProvocationCard>
      ) : claim.vote ? (
        <LoreVoteWidget
          mode="lore"
          vote={claim.vote}
          voteApiUrl={data.voteApiUrl}
        />
      ) : (
        <EmptyState title="No open vote">
          <p>This claim is read-only in its current state.</p>
        </EmptyState>
      )}

      {data.verificationResult ? (
        <section className="panel grid gap-3 p-4">
          <h2 className="font-display text-base font-medium text-foreground">
            Verification
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Asserted {data.verificationResult.assertedValue}; recorded{" "}
            {data.verificationResult.actualValue ?? "unavailable"}.
          </p>
        </section>
      ) : null}

      <BranchControls
        claim={claim}
        onSubmitted={branchSubmitted}
        submitApiUrl={data.claimSubmitApiUrl}
      />

      <section className="grid gap-4">
        <div>
          <p className="flex items-center gap-2 font-display text-sm font-medium text-foreground">
            <GitBranch className="size-4 text-primary" aria-hidden="true" />
            Thread lineage
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Branches stay visible after verdicts, including disputes that
            replaced canon and challenges the league upheld.
          </p>
        </div>
        {threadTree.length > 0 ? (
          <ol aria-label="Lore claim lineage" className="grid gap-3">
            {threadTree.map((node) => (
              <ThreadNodeView
                allClaims={data.thread}
                key={node.claim.id}
                leagueId={data.league.id}
                node={node}
                selectedClaimId={claim.id}
              />
            ))}
          </ol>
        ) : (
          <EmptyState title="No branches yet">
            <p>
              Responses, addenda, disputes, and re-litigation will appear here.
            </p>
          </EmptyState>
        )}
      </section>

      {data.isSteward ? (
        <StewardControls claim={claim} onAction={stewardAction} />
      ) : null}
    </main>
  );
}
