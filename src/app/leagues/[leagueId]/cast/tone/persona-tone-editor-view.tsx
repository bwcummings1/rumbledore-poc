"use client";

import {
  ArrowLeft,
  History,
  RotateCcw,
  Save,
  SlidersHorizontal,
  WandSparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
import type {
  LeagueToneProfileEditorData,
  PersonaToneEditorCard,
  PersonaTonePreviewResult,
} from "@/ai";
import { CastPersonaOrb } from "@/components/cast/cast-presence";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type FormState = {
  beats: string;
  diction: string;
  dosAndDonts: string;
  pointOfView: string;
  reason: string;
  styleDirectives: string;
};

type RequestState =
  | { status: "idle" }
  | { status: "loading"; action: "preview" | "rollback" | "save" }
  | { status: "error"; message: string }
  | { status: "success"; message: string };

const TONE_REQUEST_TIMEOUT_MS = 15_000;

function lines(values: readonly string[]) {
  return values.join("\n");
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function formStateForCard(card: PersonaToneEditorCard): FormState {
  return {
    beats: lines(card.toneProfile.beats),
    diction: lines(card.toneProfile.diction),
    dosAndDonts: lines(card.toneProfile.dosAndDonts),
    pointOfView: card.toneProfile.pointOfView,
    reason: "",
    styleDirectives: lines(card.toneProfile.styleDirectives),
  };
}

function formToneProfile(state: FormState) {
  return {
    beats: splitLines(state.beats),
    diction: splitLines(state.diction),
    dosAndDonts: splitLines(state.dosAndDonts),
    pointOfView: state.pointOfView.replace(/\s+/g, " ").trim(),
    styleDirectives: splitLines(state.styleDirectives),
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Tone action failed";
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Tone action failed");
  }
  return payload as T;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    TONE_REQUEST_TIMEOUT_MS,
  );
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

function formatVersionDate(value: string | null) {
  if (!value) return "not edited";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function PersonaToneCard({
  card,
  leagueId,
}: {
  readonly card: PersonaToneEditorCard;
  readonly leagueId: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => formStateForCard(card));
  const [preview, setPreview] = useState<PersonaTonePreviewResult | null>(null);
  const [request, setRequest] = useState<RequestState>({ status: "idle" });
  const endpoint = `/api/leagues/${leagueId}/cast/personas/${card.persona}/tone`;
  const fieldId = (name: string) => `${card.persona}-${name}`;
  const profile = useMemo(() => formToneProfile(form), [form]);

  async function previewTone() {
    setRequest({ action: "preview", status: "loading" });
    try {
      const response = await fetchWithTimeout(`${endpoint}/preview`, {
        body: JSON.stringify({ toneProfile: profile }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      setPreview(await readJsonResponse<PersonaTonePreviewResult>(response));
      setRequest({ message: "Preview rendered.", status: "success" });
    } catch (error) {
      setRequest({ message: errorMessage(error), status: "error" });
    }
  }

  async function saveTone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequest({ action: "save", status: "loading" });
    try {
      const response = await fetchWithTimeout(endpoint, {
        body: JSON.stringify({
          expectedToneVersion: card.toneVersion,
          reason: form.reason,
          toneProfile: profile,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await readJsonResponse(response);
      setRequest({ message: "Tone profile saved.", status: "success" });
      router.refresh();
    } catch (error) {
      setRequest({ message: errorMessage(error), status: "error" });
    }
  }

  async function rollbackTone(toneVersion: number) {
    setRequest({ action: "rollback", status: "loading" });
    try {
      const response = await fetchWithTimeout(`${endpoint}/rollback`, {
        body: JSON.stringify({
          reason: `Rollback to v${toneVersion}`,
          toneVersion,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await readJsonResponse(response);
      setRequest({
        message: `Rolled back to v${toneVersion}.`,
        status: "success",
      });
      router.refresh();
    } catch (error) {
      setRequest({ message: errorMessage(error), status: "error" });
    }
  }

  const isBusy = request.status === "loading";

  return (
    <article className="panel grid gap-5 p-4" data-persona={card.persona}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <CastPersonaOrb persona={card.persona} size="md" />
          <div className="min-w-0">
            <p className="eyebrow text-primary">{card.persona}</p>
            <h2 className="heading-auspex text-lg leading-tight">
              {card.name}
            </h2>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
              {card.beat}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <StatusPill tone={card.enabled ? "live" : "neutral"}>
            {card.enabled ? "performing" : "muted"}
          </StatusPill>
          <StatusPill tone="info">v{card.toneVersion}</StatusPill>
        </div>
      </div>

      <form className="grid gap-4" onSubmit={saveTone}>
        <label className="grid gap-2" htmlFor={fieldId("point-of-view")}>
          <span className="eyebrow text-muted-foreground">Point of view</span>
          <Textarea
            id={fieldId("point-of-view")}
            maxLength={500}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                pointOfView: event.target.value,
              }))
            }
            rows={3}
            showCount
            value={form.pointOfView}
          />
        </label>

        <div className="grid gap-4 lg:grid-cols-2">
          <ToneListField
            id={fieldId("beats")}
            label="Beats"
            onChange={(value) =>
              setForm((current) => ({ ...current, beats: value }))
            }
            value={form.beats}
          />
          <ToneListField
            id={fieldId("style")}
            label="Style"
            onChange={(value) =>
              setForm((current) => ({ ...current, styleDirectives: value }))
            }
            value={form.styleDirectives}
          />
          <ToneListField
            id={fieldId("diction")}
            label="Diction"
            onChange={(value) =>
              setForm((current) => ({ ...current, diction: value }))
            }
            value={form.diction}
          />
          <ToneListField
            id={fieldId("dos-and-donts")}
            label="Do / don't"
            onChange={(value) =>
              setForm((current) => ({ ...current, dosAndDonts: value }))
            }
            value={form.dosAndDonts}
          />
        </div>

        <label className="grid gap-2" htmlFor={fieldId("ledger-note")}>
          <span className="eyebrow text-muted-foreground">Ledger note</span>
          <Textarea
            id={fieldId("ledger-note")}
            maxLength={500}
            onChange={(event) =>
              setForm((current) => ({ ...current, reason: event.target.value }))
            }
            rows={2}
            showCount
            value={form.reason}
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={isBusy}
            loading={
              request.status === "loading" && request.action === "preview"
            }
            onClick={previewTone}
            type="button"
            variant="steel"
          >
            <WandSparkles data-icon="inline-start" />
            Preview
          </Button>
          <Button
            loading={request.status === "loading" && request.action === "save"}
            type="submit"
          >
            <Save data-icon="inline-start" />
            Save version
          </Button>
        </div>
      </form>

      {request.status === "error" ? (
        <Alert tone="danger">{request.message}</Alert>
      ) : null}
      {request.status === "success" ? (
        <Alert tone="ok">{request.message}</Alert>
      ) : null}

      {preview ? (
        <section
          className="cell grid gap-3 p-4"
          aria-label={`${card.name} preview`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="eyebrow text-primary">
              Preview v{preview.toneVersion}
            </p>
            <StatusPill tone="neutral">mock pipeline</StatusPill>
          </div>
          <h3 className="heading-auspex text-base leading-tight">
            {preview.title}
          </h3>
          <p className="text-sm leading-6 text-muted-foreground">
            {preview.sampleParagraph}
          </p>
        </section>
      ) : null}

      <section
        className="grid gap-3"
        aria-label={`${card.name} version history`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="eyebrow text-primary">Version history</p>
          <StatusPill tone="neutral">{card.history.length} saved</StatusPill>
        </div>
        {card.history.length > 0 ? (
          <ol className="grid gap-2">
            {card.history.map((entry) => {
              const canRollback = entry.toneVersion < card.toneVersion;
              return (
                <li
                  className="cell flex flex-wrap items-center justify-between gap-3 p-3"
                  key={entry.id}
                >
                  <div className="min-w-0">
                    <p className="metric text-sm text-foreground">
                      v{entry.toneVersion} · {entry.source}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatVersionDate(entry.toneUpdatedAt)}
                      {entry.reason ? ` · ${entry.reason}` : ""}
                    </p>
                  </div>
                  <Button
                    disabled={!canRollback || isBusy}
                    loading={
                      request.status === "loading" &&
                      request.action === "rollback"
                    }
                    onClick={() => rollbackTone(entry.toneVersion)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <RotateCcw data-icon="inline-start" />
                    Roll back
                  </Button>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="cell flex min-h-20 items-center gap-3 p-4 text-sm text-muted-foreground">
            <History aria-hidden="true" className="size-4 text-primary" />
            No saved tone versions yet.
          </div>
        )}
      </section>
    </article>
  );
}

function ToneListField({
  id,
  label,
  onChange,
  value,
}: {
  readonly id: string;
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  return (
    <label className="grid gap-2" htmlFor={id}>
      <span className="eyebrow text-muted-foreground">{label}</span>
      <Textarea
        id={id}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        value={value}
      />
    </label>
  );
}

export function PersonaToneEditorView({
  data,
}: {
  readonly data: LeagueToneProfileEditorData;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="panel grid gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="info">Tone profiles</StatusPill>
              <span className="eyebrow text-primary">AI cast</span>
            </div>
            <h1 className="heading-auspex mt-3 text-xl leading-tight">
              {data.league.name} Tone Editor
            </h1>
          </div>
          <Link
            href={`/leagues/${data.league.id}/cast`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <ArrowLeft data-icon="inline-start" />
            Cast
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill tone="neutral">{data.cards.length} personas</StatusPill>
          <StatusPill tone="neutral">{data.league.season}</StatusPill>
          <StatusPill tone="live">ledgered</StatusPill>
        </div>
      </header>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow text-primary">Workbench</p>
            <h2 className="heading-auspex text-xl leading-tight">
              Persona voice cards
            </h2>
          </div>
          <StatusPill icon={<SlidersHorizontal />} tone="info">
            editable
          </StatusPill>
        </div>
        <div className="grid gap-4">
          {data.cards.map((card) => (
            <PersonaToneCard
              card={card}
              key={card.persona}
              leagueId={data.league.id}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
