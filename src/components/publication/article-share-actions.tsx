"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface ArticleShareActionsProps {
  text: string;
  title: string;
  url: string;
}

function absoluteShareUrl(url: string): string {
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return window.location.href;
  }
}

export function ArticleShareActions({
  text,
  title,
  url,
}: ArticleShareActionsProps) {
  const [status, setStatus] = useState<string | null>(null);

  async function copyLink() {
    const href = absoluteShareUrl(url);
    if (!navigator.clipboard?.writeText) {
      setStatus("Copy unavailable");
      return;
    }
    await navigator.clipboard.writeText(href);
    setStatus("Link copied");
  }

  async function shareArticle() {
    const href = absoluteShareUrl(url);
    if (typeof navigator.share !== "function") {
      await copyLink();
      return;
    }

    try {
      await navigator.share({ text, title, url: href });
      setStatus("Shared");
    } catch (cause) {
      if (
        cause instanceof DOMException &&
        cause.name.toLowerCase() === "aborterror"
      ) {
        return;
      }
      await copyLink();
    }
  }

  return (
    <fieldset
      className="flex flex-wrap items-center gap-2"
      data-slot="article-share-actions"
    >
      <legend className="sr-only">Article share actions</legend>
      <Button onClick={() => void shareArticle()} size="sm" type="button">
        <Share2 data-icon="inline-start" />
        Share
      </Button>
      <Button
        onClick={() => void copyLink()}
        size="sm"
        type="button"
        variant="outline"
      >
        {status === "Link copied" ? (
          <Check data-icon="inline-start" />
        ) : (
          <Copy data-icon="inline-start" />
        )}
        Copy link
      </Button>
      <span aria-live="polite" className="metric text-xs text-muted-foreground">
        {status}
      </span>
    </fieldset>
  );
}
