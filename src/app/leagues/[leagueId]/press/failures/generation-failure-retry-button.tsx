"use client";

import { RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GenerationFailureRetryResult } from "@/ai";
import { postJson } from "@/app/onboarding/client-http";
import { Button } from "@/components/ui/button";

interface GenerationFailureRetryButtonProps {
  readonly apiUrl: string;
  readonly runId: string;
}

function resultMessage(result: GenerationFailureRetryResult): string {
  switch (result.status) {
    case "already_current":
      return "Retry already current.";
    case "published":
      return "Retry published.";
    case "skipped":
      return `Retry skipped: ${result.reason}`;
    case "blocked":
      return `Retry blocked: ${result.reason}`;
    case "failed":
      return `Retry failed: ${result.errorMessage}`;
  }
}

export function GenerationFailureRetryButton({
  apiUrl,
}: GenerationFailureRetryButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await postJson<GenerationFailureRetryResult>(apiUrl);
      setMessage(resultMessage(result));
      router.refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Retry failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid justify-items-start gap-2">
      <Button
        loading={busy}
        loadingLabel="Retrying generation"
        onClick={() => void retry()}
        type="button"
        variant="secondary"
      >
        <RefreshCcw data-icon="inline-start" />
        Retry
      </Button>
      {message ? (
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}
