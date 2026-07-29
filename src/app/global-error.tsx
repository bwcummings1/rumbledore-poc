"use client";

import { useEffect } from "react";
import { logger } from "@/core/logging";
import { GLOBAL_ERROR_FALLBACK } from "@/lib/pwa";

/**
 * The last boundary. It catches errors thrown by the root layout itself, which
 * means it REPLACES that layout: no `<html>`, no `<body>`, and none of the token
 * setup that layout performs — so every `panel` and `text-ink-2` here would
 * resolve against undefined custom properties and render as unstyled text.
 *
 * It therefore styles itself from `GLOBAL_ERROR_FALLBACK` rather than from the
 * design tokens. Rendering `ThemeTokenStyle` instead would ship the token-CSS
 * generator to every client on every route to style a screen almost nobody sees
 * — measurably so: it pushed a route past the 300KB gzip budget on its own.
 * This boundary is a lifeboat, and a lifeboat carries its own supplies.
 *
 * As everywhere else, no message and no stack reach the page; only the digest,
 * which Next.js also wrote to the server log.
 */
export default function GlobalError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  const digest = error.digest;

  useEffect(() => {
    logger.error("global_error_boundary", { digest: digest ?? null });
  }, [digest]);

  return (
    <html lang="en">
      <body
        style={{
          alignItems: "center",
          backgroundColor: GLOBAL_ERROR_FALLBACK.background,
          color: GLOBAL_ERROR_FALLBACK.text,
          display: "flex",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
          justifyContent: "center",
          margin: 0,
          minHeight: "100dvh",
          padding: "1.5rem",
        }}
      >
        <main
          style={{
            border: `1px solid ${GLOBAL_ERROR_FALLBACK.border}`,
            borderRadius: "0.75rem",
            maxWidth: "28rem",
            padding: "2rem",
            textAlign: "center",
            width: "100%",
          }}
        >
          <p
            style={{
              color: GLOBAL_ERROR_FALLBACK.accent,
              fontSize: "0.6875rem",
              letterSpacing: "0.12em",
              margin: 0,
              textTransform: "uppercase",
            }}
          >
            System {"//"} Error
          </p>
          <h1
            style={{
              fontSize: "1.25rem",
              lineHeight: 1.3,
              margin: "0.5rem 0 0",
            }}
          >
            Rumbledore could not start
          </h1>
          <p
            style={{
              color: GLOBAL_ERROR_FALLBACK.muted,
              fontSize: "0.875rem",
              lineHeight: 1.6,
              margin: "0.5rem 0 0",
            }}
          >
            Something failed before the app finished loading. Reloading usually
            clears it.
          </p>
          <button
            onClick={reset}
            style={{
              background: GLOBAL_ERROR_FALLBACK.buttonBackground,
              border: "none",
              borderRadius: "0.5rem",
              color: GLOBAL_ERROR_FALLBACK.buttonText,
              cursor: "pointer",
              fontSize: "0.875rem",
              marginTop: "1.5rem",
              // The mobile budget's 44px tap-target floor, which this screen
              // must honour even though no stylesheet is guaranteed here.
              minHeight: "2.75rem",
              padding: "0.625rem 1.25rem",
            }}
            type="button"
          >
            Try again
          </button>
          {digest ? (
            <p
              style={{
                color: GLOBAL_ERROR_FALLBACK.subtle,
                fontSize: "0.75rem",
                margin: "1rem 0 0",
              }}
            >
              Reference {digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
