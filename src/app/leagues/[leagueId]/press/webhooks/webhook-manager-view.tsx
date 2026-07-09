"use client";

import {
  ArrowLeft,
  BellRing,
  Link2,
  MessageSquare,
  Newspaper,
  PlugZap,
  Save,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import {
  PublicationMasthead,
  type PublicationNavItem,
} from "@/components/publication/front-view";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import {
  LEAGUE_PUBLICATION_SECTIONS,
  type LeaguePublicationSectionId,
} from "@/news/sections";
import type {
  LeagueWebhookContentEvent,
  LeagueWebhookEventSelection,
  LeagueWebhookManagerData,
  LeagueWebhookSummary,
  LeagueWebhookTargetKind,
} from "@/webhooks";

type RequestState =
  | { status: "idle" }
  | { action: string; status: "loading" }
  | { message: string; status: "error" | "success" };

type RequestStatus = RequestState["status"];

interface WebhookFormState {
  contentSections: LeaguePublicationSectionId[];
  events: LeagueWebhookContentEvent[];
  name: string;
  status: "active" | "disabled";
  targetKind: LeagueWebhookTargetKind;
  url: string;
}

const WEBHOOK_EVENTS = [
  {
    description: "New league posts from cadence, regeneration, and launch.",
    label: "Published content",
    value: "content.published",
  },
  {
    description: "Correction notes that supersede stale score-driven prose.",
    label: "Corrections",
    value: "content.corrected",
  },
] as const;

const TARGET_OPTIONS = [
  { label: "Discord", value: "discord" },
  { label: "Generic JSON", value: "generic" },
];

const STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Disabled", value: "disabled" },
];

const REQUEST_IS_BUSY = {
  error: false,
  idle: false,
  loading: true,
  success: false,
} as const satisfies Record<RequestStatus, boolean>;

const WEBHOOK_STATUS_TONE = {
  active: "live",
  disabled: "neutral",
} as const satisfies Record<LeagueWebhookSummary["status"], StatusTone>;

const DELIVERY_STATUS_TONE = {
  delivered: "success",
  failed: "danger",
} as const satisfies Record<"delivered" | "failed", StatusTone>;

const WEBHOOK_REQUEST_TIMEOUT_MS = 10_000;

function initialCreateState(): WebhookFormState {
  return {
    contentSections: LEAGUE_PUBLICATION_SECTIONS.map((section) => section.id),
    events: ["content.published", "content.corrected"],
    name: "",
    status: "active",
    targetKind: "discord",
    url: "",
  };
}

function stateForWebhook(webhook: LeagueWebhookSummary): WebhookFormState {
  return {
    contentSections: webhook.eventSelection.contentSections,
    events: webhook.eventSelection.events,
    name: webhook.name,
    status: webhook.status,
    targetKind: webhook.targetKind,
    url: "",
  };
}

function eventSelection(state: WebhookFormState): LeagueWebhookEventSelection {
  return {
    contentSections: state.contentSections,
    events: state.events,
  };
}

function toggleValue<T extends string>(values: readonly T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];
}

function deliveryTone(status: "delivered" | "failed"): StatusTone {
  return DELIVERY_STATUS_TONE[status];
}

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Webhook request failed");
  }
  return payload;
}

function isRequestBusy(request: RequestState): boolean {
  return REQUEST_IS_BUSY[request.status];
}

function requestFeedback(request: RequestState) {
  switch (request.status) {
    case "error":
      return <Alert tone="danger">{request.message}</Alert>;
    case "success":
      return <Alert tone="ok">{request.message}</Alert>;
    case "idle":
    case "loading":
      return null;
  }
}

function webhookFetch(input: RequestInfo | URL, init: RequestInit) {
  return fetch(input, {
    ...init,
    signal: AbortSignal.timeout(WEBHOOK_REQUEST_TIMEOUT_MS),
  });
}

function leaguePressNavItems(leagueId: string): PublicationNavItem[] {
  return [
    { active: false, href: `/leagues/${leagueId}/press`, label: "Front" },
    ...LEAGUE_PUBLICATION_SECTIONS.map((section) => ({
      active: false,
      href: `/leagues/${leagueId}/press/${section.slug}`,
      label: section.label,
    })),
    {
      active: true,
      href: `/leagues/${leagueId}/press/webhooks`,
      icon: <PlugZap aria-hidden="true" className="size-4" />,
      label: "Webhooks",
    },
  ];
}

function SectionSelector({
  onChange,
  value,
}: {
  readonly onChange: (value: LeaguePublicationSectionId[]) => void;
  readonly value: readonly LeaguePublicationSectionId[];
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="eyebrow text-muted-foreground">Sections</legend>
      <div className="grid gap-1 sm:grid-cols-2">
        {LEAGUE_PUBLICATION_SECTIONS.map((section) => (
          <Checkbox
            checked={value.includes(section.id)}
            key={section.id}
            label={section.label}
            onCheckedChange={() => onChange(toggleValue(value, section.id))}
          />
        ))}
      </div>
    </fieldset>
  );
}

function EventSelector({
  onChange,
  value,
}: {
  readonly onChange: (value: LeagueWebhookContentEvent[]) => void;
  readonly value: readonly LeagueWebhookContentEvent[];
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="eyebrow text-muted-foreground">Events</legend>
      <div className="grid gap-1 sm:grid-cols-2">
        {WEBHOOK_EVENTS.map((event) => (
          <Checkbox
            checked={value.includes(event.value)}
            description={event.description}
            key={event.value}
            label={event.label}
            onCheckedChange={() => onChange(toggleValue(value, event.value))}
          />
        ))}
      </div>
    </fieldset>
  );
}

function WebhookCreatePanel({ leagueId }: { readonly leagueId: string }) {
  const router = useRouter();
  const [form, setForm] = useState<WebhookFormState>(initialCreateState);
  const [request, setRequest] = useState<RequestState>({ status: "idle" });
  const isBusy = isRequestBusy(request);

  async function createWebhook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequest({ action: "create", status: "loading" });
    try {
      const response = await webhookFetch(`/api/leagues/${leagueId}/webhooks`, {
        body: JSON.stringify({
          eventSelection: eventSelection(form),
          name: form.name,
          targetKind: form.targetKind,
          url: form.url,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await readJsonResponse(response);
      setForm(initialCreateState());
      setRequest({ message: "Webhook target created.", status: "success" });
      router.refresh();
    } catch (error) {
      setRequest({
        message:
          error instanceof Error ? error.message : "Webhook target failed.",
        status: "error",
      });
    }
  }

  return (
    <section className="panel grid gap-4 p-4" aria-label="Create webhook">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-primary">New target</p>
          <h2 className="heading-auspex text-lg">Group chat endpoint</h2>
        </div>
        <StatusPill tone="info">mock delivery</StatusPill>
      </div>
      <form className="grid gap-4" onSubmit={createWebhook}>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
          <label className="grid gap-2" htmlFor="webhook-name">
            <span className="eyebrow text-muted-foreground">Name</span>
            <Input
              id="webhook-name"
              maxLength={80}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="League Discord"
              required
              value={form.name}
            />
          </label>
          <label className="grid gap-2" htmlFor="webhook-kind">
            <span className="eyebrow text-muted-foreground">Target</span>
            <Select
              id="webhook-kind"
              onValueChange={(targetKind) =>
                setForm((current) => ({
                  ...current,
                  targetKind: targetKind as LeagueWebhookTargetKind,
                }))
              }
              options={TARGET_OPTIONS}
              value={form.targetKind}
            />
          </label>
        </div>
        <label className="grid gap-2" htmlFor="webhook-url">
          <span className="eyebrow text-muted-foreground">Webhook URL</span>
          <Input
            id="webhook-url"
            onChange={(event) =>
              setForm((current) => ({ ...current, url: event.target.value }))
            }
            placeholder="https://discord.com/api/webhooks/..."
            required
            type="url"
            value={form.url}
          />
        </label>
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionSelector
            onChange={(contentSections) =>
              setForm((current) => ({ ...current, contentSections }))
            }
            value={form.contentSections}
          />
          <EventSelector
            onChange={(events) =>
              setForm((current) => ({ ...current, events }))
            }
            value={form.events}
          />
        </div>
        <Button loading={isBusy} type="submit">
          <PlugZap data-icon="inline-start" />
          Create target
        </Button>
      </form>
      {requestFeedback(request)}
    </section>
  );
}

function WebhookCard({
  leagueId,
  webhook,
}: {
  readonly leagueId: string;
  readonly webhook: LeagueWebhookSummary;
}) {
  const router = useRouter();
  const [form, setForm] = useState<WebhookFormState>(() =>
    stateForWebhook(webhook),
  );
  const [request, setRequest] = useState<RequestState>({ status: "idle" });
  const isBusy = isRequestBusy(request);
  const endpoint = `/api/leagues/${leagueId}/webhooks/${webhook.id}`;

  async function saveWebhook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequest({ action: "save", status: "loading" });
    try {
      const response = await webhookFetch(endpoint, {
        body: JSON.stringify({
          eventSelection: eventSelection(form),
          name: form.name,
          status: form.status,
          targetKind: form.targetKind,
          ...(form.url.trim() ? { url: form.url.trim() } : {}),
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await readJsonResponse(response);
      setRequest({ message: "Webhook target saved.", status: "success" });
      router.refresh();
    } catch (error) {
      setRequest({
        message:
          error instanceof Error ? error.message : "Webhook target failed.",
        status: "error",
      });
    }
  }

  async function deleteWebhook() {
    setRequest({ action: "delete", status: "loading" });
    try {
      const response = await webhookFetch(endpoint, { method: "DELETE" });
      await readJsonResponse(response);
      setRequest({ message: "Webhook target deleted.", status: "success" });
      router.refresh();
    } catch (error) {
      setRequest({
        message:
          error instanceof Error ? error.message : "Webhook delete failed.",
        status: "error",
      });
    }
  }

  return (
    <article className="cell grid gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow text-primary">{webhook.targetKind}</p>
          <h3 className="font-display text-base font-medium leading-snug text-foreground">
            {webhook.name}
          </h3>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {webhook.urlLabel}
          </p>
        </div>
        <StatusPill tone={WEBHOOK_STATUS_TONE[webhook.status]}>
          {webhook.status}
        </StatusPill>
      </div>
      <form className="grid gap-4" onSubmit={saveWebhook}>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_150px_150px]">
          <label className="grid gap-2" htmlFor={`${webhook.id}-name`}>
            <span className="eyebrow text-muted-foreground">Name</span>
            <Input
              id={`${webhook.id}-name`}
              maxLength={80}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              required
              value={form.name}
            />
          </label>
          <label className="grid gap-2" htmlFor={`${webhook.id}-kind`}>
            <span className="eyebrow text-muted-foreground">Target</span>
            <Select
              id={`${webhook.id}-kind`}
              onValueChange={(targetKind) =>
                setForm((current) => ({
                  ...current,
                  targetKind: targetKind as LeagueWebhookTargetKind,
                }))
              }
              options={TARGET_OPTIONS}
              value={form.targetKind}
            />
          </label>
          <label className="grid gap-2" htmlFor={`${webhook.id}-status`}>
            <span className="eyebrow text-muted-foreground">Status</span>
            <Select
              id={`${webhook.id}-status`}
              onValueChange={(status) =>
                setForm((current) => ({
                  ...current,
                  status: status as "active" | "disabled",
                }))
              }
              options={STATUS_OPTIONS}
              value={form.status}
            />
          </label>
        </div>
        <label className="grid gap-2" htmlFor={`${webhook.id}-url`}>
          <span className="eyebrow text-muted-foreground">Rotate URL</span>
          <Input
            id={`${webhook.id}-url`}
            onChange={(event) =>
              setForm((current) => ({ ...current, url: event.target.value }))
            }
            placeholder="Leave blank to keep encrypted URL"
            type="url"
            value={form.url}
          />
        </label>
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionSelector
            onChange={(contentSections) =>
              setForm((current) => ({ ...current, contentSections }))
            }
            value={form.contentSections}
          />
          <EventSelector
            onChange={(events) =>
              setForm((current) => ({ ...current, events }))
            }
            value={form.events}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button loading={isBusy} type="submit">
            <Save data-icon="inline-start" />
            Save target
          </Button>
          <Button
            disabled={isBusy}
            onClick={deleteWebhook}
            type="button"
            variant="danger"
          >
            <Trash2 data-icon="inline-start" />
            Delete
          </Button>
        </div>
      </form>
      <div className="grid gap-2 border-t border-[var(--hair)] pt-3 text-xs text-muted-foreground sm:grid-cols-2">
        <p>Last delivered: {formatDate(webhook.lastDeliveryAt)}</p>
        <p>Last failed: {formatDate(webhook.lastFailureAt)}</p>
      </div>
      {requestFeedback(request)}
    </article>
  );
}

export function LeagueWebhookManagerView({
  data,
}: {
  readonly data: LeagueWebhookManagerData;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <PublicationMasthead
        actions={[
          {
            href: `/leagues/${data.league.id}`,
            icon: <ArrowLeft data-icon="inline-start" />,
            label: "League home",
          },
          {
            href: `/leagues/${data.league.id}/press`,
            icon: <Newspaper data-icon="inline-start" />,
            label: "The Press",
          },
        ]}
        deck={`${data.league.season} ${data.league.provider.toUpperCase()} fantasy football. New league posts can arrive in the group chat without exposing webhook URLs.`}
        eyebrow="DISTRIBUTION"
        navAriaLabel="Press sections"
        navItems={leaguePressNavItems(data.league.id)}
        sectionLabel="Webhooks"
        title={`The ${data.league.name} Press`}
      />

      <section className="grid gap-3 sm:grid-cols-4">
        <StatTile
          label="Active"
          tone="lilac"
          value={`${data.summary.active}`}
        />
        <StatTile label="Disabled" value={`${data.summary.disabled}`} />
        <StatTile label="Delivered" value={`${data.summary.delivered}`} />
        <StatTile
          label="Failed"
          tone={data.summary.failed > 0 ? "amber" : "default"}
          value={`${data.summary.failed}`}
        />
      </section>

      <WebhookCreatePanel leagueId={data.league.id} />

      <section aria-label="Webhook targets" className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow text-primary">Targets</p>
            <h2 className="heading-auspex text-lg">Configured endpoints</h2>
          </div>
          <MessageSquare className="size-5 text-primary" aria-hidden />
        </div>
        {data.webhooks.length < 1 ? (
          <EmptyState
            icon={<PlugZap className="size-4" />}
            title="No webhook targets yet"
          >
            Add a Discord or generic JSON target to mirror league posts into the
            group chat.
          </EmptyState>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {data.webhooks.map((webhook) => (
              <WebhookCard
                key={webhook.id}
                leagueId={data.league.id}
                webhook={webhook}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-label="Recent webhook deliveries" className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow text-primary">Delivery log</p>
            <h2 className="heading-auspex text-lg">Recent fan-out</h2>
          </div>
          <BellRing className="size-5 text-warning" aria-hidden />
        </div>
        {data.deliveries.length < 1 ? (
          <div className="cell flex min-h-24 items-center gap-3 p-4 text-sm text-muted-foreground">
            <Link2 aria-hidden className="size-4 text-primary" />
            No webhook deliveries have been recorded for this league.
          </div>
        ) : (
          <div className="panel overflow-hidden">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-[var(--hair)] text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-4 py-3 font-mono">Target</th>
                  <th className="px-4 py-3 font-mono">Post</th>
                  <th className="px-4 py-3 font-mono">Event</th>
                  <th className="px-4 py-3 font-mono">Status</th>
                  <th className="px-4 py-3 font-mono">At</th>
                </tr>
              </thead>
              <tbody>
                {data.deliveries.map((delivery) => (
                  <tr
                    className="border-b border-[var(--hair)] last:border-0"
                    key={delivery.id}
                  >
                    <td className="px-4 py-3 font-medium">
                      {delivery.webhookName}
                    </td>
                    <td className="max-w-[280px] truncate px-4 py-3 text-muted-foreground">
                      {delivery.contentTitle ?? "Unknown post"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {delivery.eventType}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill
                        className={cn("w-fit")}
                        tone={deliveryTone(delivery.deliveryStatus)}
                      >
                        {delivery.deliveryStatus}
                      </StatusPill>
                      {delivery.errorMessage ? (
                        <p className="mt-1 max-w-[240px] truncate text-xs text-coral">
                          {delivery.errorMessage}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(delivery.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
