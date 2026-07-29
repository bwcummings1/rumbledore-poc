"use client";

import { useEffect } from "react";
import { logger } from "@/core/logging";
import { PWA_BACKGROUND_HEX } from "@/lib/pwa";

/**
 * The last boundary. It catches errors thrown by the root layout itself, which
 * means it REPLACES that layout: no `<html>`, no theme cookie, no
 * `ThemeTokenStyle`, no stylesheet guaranteed to have loaded.
 *
 * So this file styles itself inline instead of reaching for the design tokens.
 * A boundary that renders unstyled because the layout that defines its tokens is
 * the thing that just crashed is not a fallback — and this is the one screen
 * that has no second chance.
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
          backgroundColor: PWA_BACKGROUND_HEX,
          color: "#e7e9f2",
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
            border: "1px solid #262a3d",
            borderRadius: "0.75rem",
            maxWidth: "28rem",
            padding: "2rem",
            textAlign: "center",
            width: "100%",
          }}
        >
          <p
            style={{
              color: "#ff6b6b",
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
              color: "#9aa0b8",
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
              background: "#2f6df6",
              border: "none",
              borderRadius: "0.5rem",
              color: "#ffffff",
              cursor: "pointer",
              fontSize: "0.875rem",
              marginTop: "1.5rem",
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
                color: "#6b7192",
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
