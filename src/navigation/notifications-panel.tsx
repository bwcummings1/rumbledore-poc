"use client";

import { Settings, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Presence } from "@/components/ui/presence";
import { cn } from "@/lib/utils";

export interface NotificationsPanelItem {
  readonly detail: string;
  readonly href: string;
  readonly id: string;
  readonly read?: boolean;
  readonly timestamp: string;
  readonly title: string;
}

export interface NotificationsPanelNotice {
  readonly label: string;
  readonly status: "idle" | "offline";
}

/**
 * The open state of the shell's notifications menu, split out of
 * `navigation-shell.tsx` so `next/dynamic` has a module boundary to load on
 * demand.
 *
 * The trigger button and its unread badge deliberately stay in the shell: they
 * are always on screen, they are what the 44px mobile tap-target gate measures,
 * and server-rendering them keeps their size and position identical whether or
 * not this chunk has arrived. Only the panel — which cannot exist before a
 * click — is deferred.
 *
 * `realtimeNotice` is passed pre-resolved rather than derived here so this
 * module needs nothing from the shell at runtime; a value import back into
 * `navigation-shell.tsx` would be a cycle and would undo the split.
 */
export function NotificationsPanel({
  notifications,
  onClose,
  onMarkAllRead,
  realtimeNotice,
  unreadCount,
}: {
  readonly notifications: readonly NotificationsPanelItem[];
  readonly onClose: () => void;
  readonly onMarkAllRead: () => void;
  readonly realtimeNotice: NotificationsPanelNotice | null;
  readonly unreadCount: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <div
      aria-labelledby="notifications-panel-title"
      className="panel fixed inset-x-3 bottom-[calc(var(--space-3)+env(safe-area-inset-bottom))] z-50 grid max-h-[80dvh] gap-3 overflow-y-auto p-3 shadow-overlay md:absolute md:inset-x-auto md:right-0 md:bottom-auto md:top-12 md:w-80"
      data-slot="notifications-panel"
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
            id="notifications-panel-title"
          >
            Notifications
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Live shell notices and recent league activity.
          </p>
        </div>
        <Button
          aria-label="Close notifications"
          onClick={onClose}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" />
        </Button>
      </header>
      <div className="flex items-center justify-between gap-3">
        <span className="metric text-xs text-muted-foreground">
          {unreadCount > 0 ? `${unreadCount} unread` : "All read"}
        </span>
        <Button
          disabled={unreadCount === 0}
          onClick={onMarkAllRead}
          size="sm"
          type="button"
          variant="ghost"
        >
          Mark all read
        </Button>
      </div>
      {realtimeNotice ? (
        <div
          aria-live="polite"
          className="cell flex min-h-11 items-center gap-2 border-warning/40 bg-warning/10 px-3 py-2 text-sm text-muted-foreground"
        >
          <Presence
            label={realtimeNotice.label}
            status={realtimeNotice.status}
          />
          <span>{realtimeNotice.label}</span>
        </div>
      ) : null}
      {notifications.length === 0 ? (
        <div className="cell grid gap-1 p-4 text-sm text-muted-foreground">
          <p className="font-display font-semibold text-foreground">
            All caught up.
          </p>
          <p>The notification stream is quiet.</p>
        </div>
      ) : (
        <ul className="grid gap-2">
          {notifications.map((notification) => (
            <li key={notification.id}>
              <Link
                className={cn(
                  "cell grid min-h-14 gap-1 p-3 text-sm outline-none transition-colors hover:bg-primary/10 focus-visible:shadow-[var(--focus-ring-shadow)]",
                  !notification.read &&
                    "border-primary/40 shadow-[inset_3px_0_0_var(--primary),var(--bevel)]",
                )}
                href={notification.href}
                onClick={onClose}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="font-display font-semibold text-foreground">
                    {notification.title}
                  </span>
                  <span className="metric shrink-0 text-xs text-muted-foreground">
                    {notification.timestamp}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  {notification.detail}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        className="inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-sm font-medium text-muted-foreground outline-none hover:bg-primary/10 hover:text-foreground focus-visible:shadow-[var(--focus-ring-shadow)]"
        href="/you"
        onClick={onClose}
      >
        <Settings className="size-4" aria-hidden="true" />
        Notification settings
      </Link>
    </div>
  );
}
