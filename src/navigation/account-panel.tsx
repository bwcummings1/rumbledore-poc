"use client";

import { Settings, Smartphone, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import type { LeagueSwitcherViewItem } from "./league-switcher-model";

const DeferredInstallAffordance = dynamic(
  () =>
    import("@/components/pwa/install-affordance").then(
      (mod) => mod.InstallAffordance,
    ),
  { loading: () => null, ssr: false },
);

const DeferredSignOutButton = dynamic(
  () => import("@/app/you/sign-out-button").then((mod) => mod.SignOutButton),
  {
    loading: () => (
      <Button disabled size="sm" type="button" variant="outline">
        Sign out
      </Button>
    ),
    ssr: false,
  },
);

/**
 * The open state of the shell's account menu, split out of
 * `navigation-shell.tsx` so `next/dynamic` has a module boundary to load on
 * demand.
 *
 * The trigger button stays in the shell: it is always on screen and is what the
 * 44px mobile tap-target gate measures, so it must server-render at a fixed
 * size regardless of whether this chunk has loaded.
 *
 * `scopeAvatar`, `motionToggle`, and `scopeName` arrive as already-rendered
 * nodes/strings. Their sources (`ScopeAvatar`, `MotionToggle`,
 * `scopeDisplayName`) are also used by the always-visible sidebar and top bars,
 * so they belong in the main chunk; importing them here would be a cycle back
 * into the shell and would drag this chunk's contents along with them.
 *
 * The install affordance and sign-out button move with this module — they were
 * already deferred, and they were only ever reachable from inside this panel,
 * so they now sit one level down instead of being requested from every route.
 */
export function AccountPanel({
  items,
  motionToggle,
  onClose,
  scopeAvatar,
  scopeName,
  scopeProviderLabel,
}: {
  readonly items: readonly LeagueSwitcherViewItem[];
  readonly motionToggle: ReactNode;
  readonly onClose: () => void;
  readonly scopeAvatar: ReactNode;
  readonly scopeName: string;
  readonly scopeProviderLabel: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const connectedProviders = useMemo(() => {
    const providerLabels = new Map<string, string>();
    for (const item of items) {
      providerLabels.set(item.provider, item.providerLabel);
    }
    return [...providerLabels.entries()].map(([provider, label]) => ({
      label,
      provider,
    }));
  }, [items]);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <div
      aria-labelledby="account-panel-title"
      className="panel fixed inset-x-3 bottom-[calc(var(--space-3)+env(safe-area-inset-bottom))] z-50 grid max-h-[82dvh] gap-4 overflow-y-auto p-3 shadow-overlay md:absolute md:inset-x-auto md:right-0 md:bottom-auto md:top-12 md:w-80"
      data-slot="account-panel"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
        }
      }}
      ref={panelRef}
      role="dialog"
      tabIndex={-1}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2
            className="font-display text-sm font-semibold text-foreground"
            id="account-panel-title"
          >
            Account
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{scopeName}</p>
        </div>
        <Button
          aria-label="Close account menu"
          onClick={onClose}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" />
        </Button>
      </header>
      <div className="cell grid gap-2 p-3">
        <span className="eyebrow">Current scope</span>
        <div className="flex min-w-0 items-center gap-3">
          {scopeAvatar}
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-semibold">
              {scopeName}
            </p>
            <p className="text-xs text-muted-foreground">
              {scopeProviderLabel}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        <span className="eyebrow">Connected providers</span>
        <div className="flex flex-wrap gap-2">
          {connectedProviders.length > 0 ? (
            connectedProviders.map((provider) => (
              <Tag key={provider.provider}>{provider.label}</Tag>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">
              No connected league providers yet.
            </span>
          )}
        </div>
      </div>

      {motionToggle}

      <DeferredInstallAffordance />

      <div className="grid gap-2 border-t border-[var(--hair)] pt-3">
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-sm font-medium text-muted-foreground outline-none hover:bg-primary/10 hover:text-foreground focus-visible:shadow-[var(--focus-ring-shadow)]"
          href="/you"
          onClick={onClose}
        >
          <Settings className="size-4" aria-hidden="true" />
          Account and settings
        </Link>
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-sm font-medium text-muted-foreground outline-none hover:bg-primary/10 hover:text-foreground focus-visible:shadow-[var(--focus-ring-shadow)]"
          href="/you"
          onClick={onClose}
        >
          <Smartphone className="size-4" aria-hidden="true" />
          Push, install, and providers
        </Link>
        <DeferredSignOutButton />
      </div>
    </div>
  );
}
