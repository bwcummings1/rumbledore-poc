"use client";

import { Share2, Smartphone, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export const INSTALL_DISMISS_STORAGE_KEY = "rumbledore:pwa-install-dismissed";

type InstallPromptOutcome = "accepted" | "dismissed";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: string[];
  readonly userChoice: Promise<{
    readonly outcome: InstallPromptOutcome;
    readonly platform: string;
  }>;
  prompt(): Promise<void>;
}

type InstallMode = "android" | "ios";
type PromptStatus = "idle" | "accepted" | "prompting";

function getNavigatorStandalone(): boolean {
  return (
    (navigator as Navigator & { readonly standalone?: boolean }).standalone ===
    true
  );
}

function isStandaloneDisplayMode(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    getNavigatorStandalone()
  );
}

function isDismissed(): boolean {
  try {
    return window.localStorage.getItem(INSTALL_DISMISS_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function persistDismissal(): void {
  try {
    window.localStorage.setItem(INSTALL_DISMISS_STORAGE_KEY, "true");
  } catch {
    // Storage can be unavailable in private browsing; dismissal is best-effort.
  }
}

function isIosSafari(): boolean {
  const userAgent = navigator.userAgent;
  const vendor = navigator.vendor;
  const platform = navigator.platform;
  const touchPoints = navigator.maxTouchPoints ?? 0;
  const isiOS =
    /iPad|iPhone|iPod/i.test(userAgent) ||
    (platform === "MacIntel" && touchPoints > 1);
  if (!isiOS) {
    return false;
  }
  const isWebKitSafari = /Safari/i.test(userAgent) && /Apple/i.test(vendor);
  const knownNonSafari =
    /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|Brave|Chrome|Chromium/i.test(
      userAgent,
    );
  return isWebKitSafari && !knownNonSafari;
}

export function InstallAffordance() {
  const [mode, setMode] = useState<InstallMode | null>(null);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [status, setStatus] = useState<PromptStatus>("idle");

  useEffect(() => {
    if (isDismissed() || isStandaloneDisplayMode()) {
      return;
    }

    if (isIosSafari()) {
      setMode("ios");
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setMode("android");
      setStatus("idle");
    };
    const onAppInstalled = () => {
      setDeferredPrompt(null);
      setMode(null);
      setStatus("idle");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    persistDismissal();
    setDeferredPrompt(null);
    setMode(null);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) {
      return;
    }
    setStatus("prompting");
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "dismissed") {
        dismiss();
        return;
      }
      setStatus("accepted");
    } catch {
      setStatus("idle");
    }
  }, [deferredPrompt, dismiss]);

  if (mode === null) {
    return null;
  }

  return (
    <div className="panel grid gap-4 p-4" data-slot="install-affordance">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-primary">Home screen</p>
          <h2 className="mt-1 font-display text-lg font-medium tracking-normal">
            Add Rumbledore
          </h2>
        </div>
        {mode === "ios" ? (
          <Share2 className="size-5 text-primary" aria-hidden="true" />
        ) : (
          <Smartphone className="size-5 text-primary" aria-hidden="true" />
        )}
      </div>

      {mode === "ios" ? (
        <p className="mt-2 text-sm text-muted-foreground">
          In Safari, tap Share, then Add to Home Screen to keep this league hub
          next to the group chat.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Install the PWA for a faster launch and an app-like league shell.
          </p>
          {status === "accepted" ? (
            <output aria-live="polite" className="mt-2 text-sm text-primary">
              Install started. Finish in the browser prompt.
            </output>
          ) : null}
        </>
      )}

      <div className="flex flex-wrap gap-2">
        {mode === "android" ? (
          <Button
            disabled={status === "prompting" || status === "accepted"}
            onClick={install}
            size="sm"
            type="button"
          >
            <Smartphone data-icon="inline-start" />
            Add to home screen
          </Button>
        ) : null}
        <Button onClick={dismiss} size="sm" type="button" variant="outline">
          <X data-icon="inline-start" />
          {mode === "ios" ? "Hide tip" : "Not now"}
        </Button>
      </div>
    </div>
  );
}
