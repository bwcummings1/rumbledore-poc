"use client";

import {
  ArrowRight,
  Bot,
  ChevronDown,
  LockKeyhole,
  SendHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  PersonalAgentAnswer,
  PersonalAgentAnswerResult,
  PersonalAgentPageContext,
} from "@/ai/personal-agent";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import type { ActiveNavigationState } from "@/navigation/scope";

type AmbientAgentState = "empty" | "error" | "gated" | "ready" | "thinking";

interface AmbientAgentPanelProps {
  readonly activeLeagueName?: string | null;
  readonly activeState: ActiveNavigationState;
}

interface AmbientMessage {
  readonly answer?: PersonalAgentAnswer;
  readonly id: string;
  readonly role: "assistant" | "user";
  readonly text: string;
}

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function contextFromActiveState(
  activeState: ActiveNavigationState,
): PersonalAgentPageContext {
  return {
    leagueId: activeState.leagueId,
    pathname: activeState.pathname,
    scope: activeState.scope,
    sectionId: activeState.sectionId,
  };
}

function scopeLabel(
  activeState: ActiveNavigationState,
  activeLeagueName?: string | null,
): string {
  switch (activeState.scope) {
    case "arena":
      return "Central Arena";
    case "global":
      return "Your Leagues";
    case "league":
      return activeLeagueName ?? "Current league";
    case "news":
      return "Rumbledore News";
  }
}

function defaultPrompt(activeState: ActiveNavigationState): string {
  if (activeState.scope === "league") {
    if (activeState.sectionId === "records") {
      return "Who has the most playoff points in era 2?";
    }
    return "What record should I know on this page?";
  }

  return "What should I watch across my leagues?";
}

function promptChips(activeState: ActiveNavigationState): string[] {
  if (activeState.scope === "league") {
    return [
      "Who has the most playoff points in era 2?",
      "Who owns the best season in this era?",
      "Who is the playoff pain candidate?",
    ];
  }

  return [
    "What should I watch across my leagues?",
    "Show my current matchups.",
    "Where should I connect next?",
  ];
}

function responseErrorMessage(status: number): string {
  if (status === 401) {
    return "Sign in before opening the personal agent.";
  }
  if (status === 403) {
    return "This league is not available to your account.";
  }
  return "The personal agent could not answer that request.";
}

function AmbientAnswer({ answer }: { readonly answer: PersonalAgentAnswer }) {
  return (
    <article className="cell grid gap-3 p-3" data-slot="ambient-agent-answer">
      <p className="text-sm leading-6 text-foreground">{answer.text}</p>
      <div className="grid gap-2">
        {answer.citations.map((citation) => {
          const body = (
            <>
              <span className="font-mono text-xs uppercase tracking-[0.14em] text-primary">
                {citation.label}
              </span>
              <span className="text-xs leading-5 text-muted-foreground">
                {citation.detail}
              </span>
            </>
          );

          return citation.href ? (
            <Link
              className="grid gap-1 rounded-control border border-[var(--hair)] p-2 outline-none transition-colors hover:border-[var(--hair-3)] hover:bg-elevated/60 focus-visible:shadow-[var(--focus-ring-shadow)]"
              href={citation.href}
              key={`${citation.label}-${citation.detail}`}
            >
              {body}
            </Link>
          ) : (
            <div
              className="grid gap-1 rounded-control border border-[var(--hair)] p-2"
              key={`${citation.label}-${citation.detail}`}
            >
              {body}
            </div>
          );
        })}
      </div>
    </article>
  );
}

function ThinkingState() {
  return (
    <div className="cell grid gap-3 p-3" data-slot="ambient-agent-thinking">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="orb orb-md think" />
        <div>
          <p className="eyebrow text-primary">Thinking</p>
          <p className="text-sm text-muted-foreground">
            Reading the current scope and curated league substrate.
          </p>
        </div>
      </div>
      <Skeleton className="h-3 w-11/12" variant="line" />
      <Skeleton className="h-3 w-3/4" variant="line" />
      <Skeleton className="h-3 w-5/6" variant="line" />
    </div>
  );
}

function EmptyState({
  activeState,
  onPrompt,
}: {
  readonly activeState: ActiveNavigationState;
  readonly onPrompt: (prompt: string) => void;
}) {
  return (
    <div className="grid gap-4 p-2" data-slot="ambient-agent-empty">
      <div className="grid place-items-center gap-3 py-3 text-center">
        <span aria-hidden="true" className="orb orb-lg" />
        <div>
          <p className="eyebrow text-primary">WizKit</p>
          <h2 className="heading-auspex text-base">Personal agent</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Ask about this page, this league, or your cross-league week. League
            answers use curated records and canon lore.
          </p>
        </div>
      </div>
      <div className="grid gap-2">
        {promptChips(activeState).map((prompt) => (
          <Button
            className="justify-between text-left"
            key={prompt}
            onClick={() => onPrompt(prompt)}
            type="button"
            variant="outline"
          >
            <span className="truncate">{prompt}</span>
            <ArrowRight data-icon="inline-end" />
          </Button>
        ))}
      </div>
    </div>
  );
}

function GatedState() {
  return (
    <div className="cell grid gap-3 p-3" data-slot="ambient-agent-gated">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="orb orb-md muted grid shrink-0 place-items-center text-warning"
        >
          <LockKeyhole className="size-4" />
        </span>
        <div>
          <p className="eyebrow text-warning">WizKit access check</p>
          <h2 className="font-display text-base font-medium">
            Personal agent is gated
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            The entitlement gate is working. Pricing is not wired yet, and the
            current app config leaves WizKit open for testing.
          </p>
        </div>
      </div>
      <Link
        className="btn btn-amber w-fit max-sm:w-full"
        href="/you#upgrade-options"
      >
        Review WizKit
        <ArrowRight data-icon="inline-end" />
      </Link>
    </div>
  );
}

export function AmbientAgentPanel({
  activeLeagueName,
  activeState,
}: AmbientAgentPanelProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AmbientMessage[]>([]);
  const [state, setState] = useState<AmbientAgentState>("empty");
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scope = useMemo(
    () => scopeLabel(activeState, activeLeagueName),
    [activeLeagueName, activeState],
  );
  const prompt = input.trim();

  useEffect(() => {
    if (!open) {
      return;
    }

    const panel = panelRef.current;
    const previouslyFocused = document.activeElement;
    inputRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }

      if (event.key !== "Tab" || !panel) {
        return;
      }

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((node) => node.offsetParent !== null);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (
        previouslyFocused instanceof HTMLElement &&
        document.contains(previouslyFocused)
      ) {
        previouslyFocused.focus();
      } else {
        triggerRef.current?.focus();
      }
    };
  }, [open]);

  const submitPrompt = useCallback(
    async (rawPrompt: string) => {
      const question = rawPrompt.trim();
      if (!question) {
        return;
      }

      const userMessage: AmbientMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        text: question,
      };
      setMessages((current) => [...current, userMessage]);
      setInput("");
      setError(null);
      setState("thinking");

      try {
        const response = await fetch("/api/personal-agent/messages", {
          body: JSON.stringify({
            context: contextFromActiveState(activeState),
            question,
          }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        });

        if (!response.ok) {
          throw new Error(responseErrorMessage(response.status));
        }

        const payload = (await response.json()) as PersonalAgentAnswerResult;
        if (payload.status === "blocked") {
          setState("gated");
          return;
        }

        setMessages((current) => [
          ...current,
          {
            answer: payload.answer,
            id: `assistant-${payload.answer.generatedAt}`,
            role: "assistant",
            text: payload.answer.text,
          },
        ]);
        setState("ready");
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "The personal agent could not answer that request.",
        );
        setState("error");
      }
    },
    [activeState],
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitPrompt(prompt);
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 md:inset-x-auto md:right-5 md:bottom-5"
      data-slot="ambient-agent-region"
    >
      <div className="pointer-events-auto ml-auto grid w-full max-w-[26rem] justify-items-end gap-3">
        {open ? (
          <section
            aria-label="WizKit personal agent"
            aria-modal="true"
            className="panel grid max-h-[min(76dvh,42rem)] w-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden shadow-overlay"
            data-state={state}
            data-slot="ambient-agent-panel"
            ref={panelRef}
            role="dialog"
          >
            <header className="flex items-start justify-between gap-3 border-b border-[var(--hair)] bg-[var(--panel-solid)]/95 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    "orb orb-md shrink-0",
                    state === "thinking" && "think",
                    state === "gated" && "muted",
                  )}
                />
                <div className="min-w-0">
                  <p className="eyebrow text-primary">WizKit</p>
                  <h2 className="truncate font-display text-sm font-medium">
                    Personal agent
                  </h2>
                  <p className="truncate text-xs text-muted-foreground">
                    Scope: {scope}
                  </p>
                </div>
              </div>
              <Button
                aria-label="Close personal agent"
                onClick={() => setOpen(false)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <X />
              </Button>
            </header>

            <div
              aria-live="polite"
              className="grid min-h-0 gap-3 overflow-y-auto px-3 py-3"
            >
              {state === "empty" && messages.length === 0 ? (
                <EmptyState activeState={activeState} onPrompt={submitPrompt} />
              ) : null}
              {messages.map((message) =>
                message.role === "user" ? (
                  <div
                    className="ml-auto max-w-[88%] rounded-card border border-[var(--hair-2)] bg-primary/10 px-3 py-2 text-sm"
                    data-slot="ambient-agent-user-message"
                    key={message.id}
                  >
                    {message.text}
                  </div>
                ) : message.answer ? (
                  <AmbientAnswer answer={message.answer} key={message.id} />
                ) : null,
              )}
              {state === "thinking" ? <ThinkingState /> : null}
              {state === "gated" ? <GatedState /> : null}
              {state === "error" && error ? (
                <Alert tone="danger" title="Agent unavailable">
                  {error}
                </Alert>
              ) : null}
            </div>

            <form
              className="grid gap-2 border-t border-[var(--hair)] bg-[var(--panel-solid)]/95 px-3 py-3"
              onSubmit={onSubmit}
            >
              <label className="sr-only" htmlFor="ambient-agent-question">
                Ask the personal agent
              </label>
              <div className="flex gap-2">
                <input
                  className="min-h-11 min-w-0 flex-1 rounded-control border border-[var(--hair)] bg-background/60 px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:shadow-[var(--focus-ring-shadow)]"
                  id="ambient-agent-question"
                  maxLength={400}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={defaultPrompt(activeState)}
                  ref={inputRef}
                  value={input}
                />
                <Button
                  aria-label="Send personal agent question"
                  disabled={!prompt || state === "thinking"}
                  loading={state === "thinking"}
                  size="icon"
                  type="submit"
                  variant="primary"
                >
                  <SendHorizontal />
                </Button>
              </div>
            </form>
          </section>
        ) : null}

        <button
          aria-expanded={open}
          aria-label={open ? "Collapse personal agent" : "Open personal agent"}
          className="btn btn-ghost relative inline-flex size-14 items-center justify-center rounded-full p-0 shadow-[0_0_28px_-8px_var(--glow-lilac),var(--bevel)] focus-visible:shadow-[var(--focus-ring-shadow)] focus-visible:outline-none"
          onClick={() => setOpen((value) => !value)}
          ref={triggerRef}
          type="button"
        >
          <span
            aria-hidden="true"
            className={cn("orb orb-lg", state === "thinking" && "think")}
          >
            <Bot className="size-5" />
          </span>
          <span className="sr-only">
            {open ? "Collapse WizKit" : "Open WizKit"}
          </span>
          {open ? (
            <ChevronDown className="absolute -top-1 -right-1 size-4 text-primary" />
          ) : (
            <Sparkles className="absolute -top-1 -right-1 size-4 text-warning" />
          )}
        </button>

        {!open ? (
          <StatusPill
            className="hidden shadow-overlay md:inline-flex"
            tone="info"
          >
            WizKit
          </StatusPill>
        ) : null}
      </div>
    </div>
  );
}
