"use client";

import { useCallback, useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { registerServiceWorker } from "./service-worker-registration";

type NotificationState =
  | "blocked"
  | "checking"
  | "default"
  | "enabled"
  | "error"
  | "unsupported";

interface LeagueNotificationToggleProps {
  leagueId: string;
}

const PUSH_REQUEST_TIMEOUT_MS = 10_000;

function supportsWebPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "PushManager" in window &&
    "serviceWorker" in navigator
  );
}

export function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replaceAll("-", "+").replaceAll("_", "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output.buffer as ArrayBuffer;
}

async function existingPushSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration?.();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

async function pushFetch(
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    PUSH_REQUEST_TIMEOUT_MS,
  );
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function isLeagueSubscriptionActive(input: {
  endpoint: string;
  leagueId: string;
}): Promise<boolean> {
  const response = await pushFetch("/api/push/subscriptions/status", {
    body: JSON.stringify(input),
    cache: "no-store",
    credentials: "same-origin", // ubs:ignore — Fetch credentials mode enum, not a secret.
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    return false;
  }
  const status = (await response.json()) as { status?: string };
  return status.status === "active";
}

export function LeagueNotificationToggle({
  leagueId,
}: LeagueNotificationToggleProps) {
  const [state, setState] = useState<NotificationState>("checking");

  useEffect(() => {
    if (!supportsWebPush()) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }
    if (Notification.permission !== "granted") {
      setState("default");
      return;
    }

    let mounted = true;
    existingPushSubscription()
      .then(async (subscription) => {
        const active = subscription
          ? await isLeagueSubscriptionActive({
              endpoint: subscription.endpoint,
              leagueId,
            })
          : false;
        if (mounted) {
          setState(active ? "enabled" : "default");
        }
      })
      .catch(() => {
        if (mounted) {
          setState("default");
        }
      });
    return () => {
      mounted = false;
    };
  }, [leagueId]);

  const enable = useCallback(async () => {
    setState("checking");
    try {
      const keyResponse = await pushFetch("/api/push/vapid-key", {
        cache: "no-store",
        credentials: "same-origin", // ubs:ignore — Fetch credentials mode enum, not a secret.
      });
      if (!keyResponse.ok) {
        throw new Error(`Push key request failed with ${keyResponse.status}`);
      }
      const { publicKey } = (await keyResponse.json()) as {
        publicKey?: string;
      };
      if (!publicKey) {
        throw new Error("Push public key is unavailable");
      }

      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "default");
        return;
      }

      const registration =
        registerServiceWorker() ?? navigator.serviceWorker.ready;
      const serviceWorker = await registration;
      const existing = await serviceWorker.pushManager.getSubscription();
      const subscription =
        existing ??
        (await serviceWorker.pushManager.subscribe({
          applicationServerKey: urlBase64ToArrayBuffer(publicKey),
          userVisibleOnly: true,
        }));

      const response = await pushFetch("/api/push/subscriptions", {
        body: JSON.stringify({
          leagueId,
          subscription: subscription.toJSON(),
        }),
        cache: "no-store",
        credentials: "same-origin", // ubs:ignore — Fetch credentials mode enum, not a secret.
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(
          `Push subscription save failed with ${response.status}`,
        );
      }
      setState("enabled");
    } catch {
      setState("error");
    }
  }, [leagueId]);

  const disable = useCallback(async () => {
    setState("checking");
    try {
      const subscription = await existingPushSubscription();
      if (!subscription) {
        setState("default");
        return;
      }
      const response = await pushFetch("/api/push/subscriptions", {
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          leagueId,
        }),
        cache: "no-store",
        credentials: "same-origin", // ubs:ignore — Fetch credentials mode enum, not a secret.
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(
          `Push subscription disable failed with ${response.status}`,
        );
      }
      setState("default");
    } catch {
      setState("error");
    }
  }, [leagueId]);

  if (state === "unsupported") {
    return null;
  }

  const enabled = state === "enabled";
  const blocked = state === "blocked";
  const busy = state === "checking";
  const label = enabled ? "Notifications on" : "Notifications";
  const description = blocked
    ? "Blocked in browser settings"
    : busy
      ? "Checking permission"
      : enabled
        ? "League alerts are enabled"
        : "Notify me";

  return (
    <Switch
      checked={enabled}
      description={description}
      disabled={busy || blocked}
      label={label}
      onCheckedChange={(next) => {
        if (next) {
          void enable();
        } else {
          void disable();
        }
      }}
    />
  );
}
