"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Select } from "@/components/ui/select";
// Types and constants only — importing from "@/push" would drag the notifier
// and the Drizzle preference queries into the client bundle.
import {
  NOTIFICATION_CHANNEL_VALUES,
  NOTIFICATION_EVENT_FAMILY_VALUES,
  type NotificationChannel,
  type NotificationEventFamily,
} from "@/push/interfaces";

export interface LeagueNotificationPreference {
  readonly channels: Readonly<
    Record<NotificationEventFamily, NotificationChannel>
  >;
  readonly leagueId: string;
  readonly name: string;
}

interface NotificationPreferenceMatrixProps {
  readonly leagues: readonly LeagueNotificationPreference[];
}

type SaveState =
  | { readonly status: "idle" }
  | { readonly message: string; readonly status: "error" | "saved" };

const PREFERENCE_REQUEST_TIMEOUT_MS = 10_000;

const FAMILY_LABELS = {
  arena: "Arena",
  bets: "Bets",
  content: "Content",
  lore: "Lore",
} as const satisfies Record<NotificationEventFamily, string>;

const CHANNEL_LABELS = {
  digest: "Weekly digest",
  none: "Off",
  push: "Web Push",
} as const satisfies Record<NotificationChannel, string>;

const CHANNEL_OPTIONS = NOTIFICATION_CHANNEL_VALUES.map((channel) => ({
  label: CHANNEL_LABELS[channel],
  value: channel,
}));

type ChannelsByLeague = Record<
  string,
  Record<NotificationEventFamily, NotificationChannel>
>;

function initialChannels(
  leagues: readonly LeagueNotificationPreference[],
): ChannelsByLeague {
  return Object.fromEntries(
    leagues.map((league) => [league.leagueId, { ...league.channels }]),
  );
}

export function NotificationPreferenceMatrix({
  leagues,
}: NotificationPreferenceMatrixProps) {
  const [channels, setChannels] = useState<ChannelsByLeague>(() =>
    initialChannels(leagues),
  );
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  async function changeChannel(input: {
    channel: NotificationChannel;
    eventFamily: NotificationEventFamily;
    leagueId: string;
  }) {
    const previous = channels[input.leagueId]?.[input.eventFamily];
    if (!previous || previous === input.channel) {
      return;
    }

    const key = `${input.leagueId}:${input.eventFamily}`;
    // Optimistic: the <select> should not snap back while the request is out.
    setChannels((current) => ({
      ...current,
      [input.leagueId]: {
        ...current[input.leagueId],
        [input.eventFamily]: input.channel,
      } as Record<NotificationEventFamily, NotificationChannel>,
    }));
    setPendingKey(key);
    setSave({ status: "idle" });

    try {
      const response = await fetch("/api/push/preferences", {
        body: JSON.stringify({
          channel: input.channel,
          eventFamily: input.eventFamily,
          leagueId: input.leagueId,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
        signal: AbortSignal.timeout(PREFERENCE_REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error("Notification preference was not saved.");
      }
      setSave({
        message: `${FAMILY_LABELS[input.eventFamily]} now arrives by ${CHANNEL_LABELS[input.channel].toLowerCase()}.`,
        status: "saved",
      });
    } catch {
      setChannels((current) => ({
        ...current,
        [input.leagueId]: {
          ...current[input.leagueId],
          [input.eventFamily]: previous,
        } as Record<NotificationEventFamily, NotificationChannel>,
      }));
      setSave({
        message: "Notification preference could not be saved. Try again.",
        status: "error",
      });
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <div className="grid gap-4" data-slot="notification-preference-matrix">
      {leagues.map((league) => (
        <fieldset className="grid gap-2" key={league.leagueId}>
          <legend className="eyebrow text-muted-foreground">
            {league.name}
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {NOTIFICATION_EVENT_FAMILY_VALUES.map((family) => {
              const controlId = `notify-${league.leagueId}-${family}`;
              return (
                <label className="grid gap-1" htmlFor={controlId} key={family}>
                  <span className="text-xs text-muted-foreground">
                    {FAMILY_LABELS[family]}
                  </span>
                  <Select
                    disabled={pendingKey === `${league.leagueId}:${family}`}
                    id={controlId}
                    onValueChange={(channel) =>
                      void changeChannel({
                        channel: channel as NotificationChannel,
                        eventFamily: family,
                        leagueId: league.leagueId,
                      })
                    }
                    options={CHANNEL_OPTIONS}
                    value={channels[league.leagueId]?.[family] ?? "none"}
                  />
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      {save.status === "saved" ? <Alert tone="ok">{save.message}</Alert> : null}
      {save.status === "error" ? (
        <Alert tone="danger">{save.message}</Alert>
      ) : null}
    </div>
  );
}
