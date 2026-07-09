"use client";

import { RefreshCw, ShieldX } from "lucide-react";
import { useState } from "react";
import { onboardingPanelError, postJson } from "@/app/onboarding/client-http";
import { Button } from "@/components/ui/button";
import { CastOrbStatus } from "@/components/ui/spectacle";
import { cn } from "@/lib/utils";

interface EditorialArticleActionsProps {
  readonly canManage: boolean;
  readonly lifecycleStatus: "published" | "retracted" | "superseded";
  readonly regenerateApiUrl: string;
  readonly retractApiUrl: string;
}

type PendingAction = "regenerate" | "retract" | null;

export function EditorialArticleActions({
  canManage,
  lifecycleStatus,
  regenerateApiUrl,
  retractApiUrl,
}: EditorialArticleActionsProps) {
  const [pending, setPending] = useState<PendingAction>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canRetract = lifecycleStatus === "published";
  const canRegenerate = lifecycleStatus === "published";

  if (!canManage) {
    return null;
  }

  async function runRetract() {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("A retraction reason is required.");
      return;
    }
    setPending("retract");
    setError(null);
    setNotice(null);
    try {
      await postJson(retractApiUrl, { reason: trimmed });
      setNotice("Retraction recorded.");
      window.location.reload();
    } catch (cause) {
      setError(onboardingPanelError(cause).message);
    } finally {
      setPending(null);
    }
  }

  async function runRegenerate() {
    setPending("regenerate");
    setError(null);
    setNotice(null);
    try {
      await postJson(regenerateApiUrl, {
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      setNotice("Regeneration queued through the cast.");
      window.location.reload();
    } catch (cause) {
      setError(onboardingPanelError(cause).message);
    } finally {
      setPending(null);
    }
  }

  return (
    <aside
      aria-label="Editorial controls"
      className="panel mx-auto grid w-full max-w-[72ch] gap-4 border-warning/30 p-4"
      data-slot="editorial-controls"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <p className="eyebrow text-warning">Editorial</p>
          <h2 className="heading-auspex text-base">Control plane</h2>
        </div>
        {pending === "regenerate" ? (
          <CastOrbStatus state="writing" />
        ) : (
          <span className="metric text-xs text-muted-foreground">
            {lifecycleStatus}
          </span>
        )}
      </div>

      <label className="grid gap-2">
        <span className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
          Reason
        </span>
        <textarea
          className={cn(
            "min-h-24 rounded-control border border-input bg-[var(--panel-2)] px-3 py-2 text-sm text-foreground shadow-[var(--bevel)] outline-none",
            "focus:border-primary/70 focus:shadow-[var(--focus-ring-shadow)]",
          )}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Required for retraction"
          value={reason}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!canRetract}
          loading={pending === "retract"}
          onClick={runRetract}
          type="button"
          variant="danger"
        >
          <ShieldX data-icon="inline-start" />
          Retract
        </Button>
        <Button
          disabled={!canRegenerate}
          loading={pending === "regenerate"}
          onClick={runRegenerate}
          type="button"
          variant="outline"
        >
          <RefreshCw data-icon="inline-start" />
          Regenerate
        </Button>
      </div>

      {error ? (
        <p
          className="rounded-control border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-coral"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-control border border-jade/40 bg-jade/10 px-3 py-2 text-sm text-jade">
          {notice}
        </p>
      ) : null}
    </aside>
  );
}
