import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ArenaErrorBoundary from "./arena/error";
import RootErrorBoundary from "./error";
import GlobalError from "./global-error";
import InviteErrorBoundary from "./invite/error";
import LeagueErrorBoundary from "./leagues/[leagueId]/error";
import NewsErrorBoundary from "./news/error";
import OnboardingErrorBoundary from "./onboarding/error";
import YouErrorBoundary from "./you/error";

vi.mock("@/core/logging", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const appRoot = __dirname;

/** A message shaped like the ones that actually leak: paths and credentials. */
const LEAKY_MESSAGE =
  'password=hunter2 while querying "leagues" at /srv/app/src/db/client.ts:88';

function leakyError() {
  const error = new Error(LEAKY_MESSAGE) as Error & { digest?: string };
  error.digest = "3915430531";
  error.stack = `Error: ${LEAKY_MESSAGE}\n    at loadLeague (/srv/app/src/leagues/read.ts:12:3)`;
  return error;
}

// `global` renders its own <html>/<body>, which is exactly the point of it —
// React logs one "cannot be a child of <div>" warning per render because the
// testing-library container is a div. Expected noise, not a failure.
const boundaries = [
  ["root", RootErrorBoundary],
  ["arena", ArenaErrorBoundary],
  ["news", NewsErrorBoundary],
  ["you", YouErrorBoundary],
  ["onboarding", OnboardingErrorBoundary],
  ["invite", InviteErrorBoundary],
  ["leagues/[leagueId]", LeagueErrorBoundary],
  ["global", GlobalError],
] as const;

function errorFilesUnder(dir: string, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === "api") {
        continue;
      }
      found.push(...errorFilesUnder(path.join(dir, entry.name), relative));
      continue;
    }
    if (entry.name === "error.tsx" || entry.name === "global-error.tsx") {
      found.push(relative);
    }
  }
  return found.sort();
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("App Router error boundaries", () => {
  it("covers the root, the shell segments, and the global fallback", () => {
    expect(errorFilesUnder(appRoot)).toEqual([
      "arena/error.tsx",
      "error.tsx",
      "global-error.tsx",
      "invite/error.tsx",
      "leagues/[leagueId]/error.tsx",
      "news/error.tsx",
      "onboarding/error.tsx",
      "you/error.tsx",
    ]);
  });

  it.each(boundaries)(
    "%s renders a human fallback with a retry",
    (_segment, Boundary) => {
      const reset = vi.fn();

      render(<Boundary error={leakyError()} reset={reset} />);

      expect(
        screen.getByRole("heading", { level: 1 }).textContent,
      ).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: /try again/i }));
      expect(reset).toHaveBeenCalledTimes(1);
    },
  );

  it.each(boundaries)(
    "%s leaks neither the error message nor the stack",
    (_segment, Boundary) => {
      render(<Boundary error={leakyError()} reset={vi.fn()} />);

      const rendered = document.body.textContent ?? "";
      expect(rendered).not.toContain("hunter2");
      expect(rendered).not.toContain("password");
      expect(rendered).not.toContain("/srv/app");
      expect(rendered).not.toContain("loadLeague");
    },
  );

  it("keeps every boundary a client component", () => {
    for (const file of errorFilesUnder(appRoot)) {
      const source = readFileSync(path.join(appRoot, file), "utf8");
      expect(source.startsWith('"use client";'), `${file}`).toBe(true);
    }
  });

  it("renders the global fallback without depending on the root layout", () => {
    // It replaces the layout that defines the theme tokens, so it must not reach
    // for a token-driven class that would render as unstyled text.
    const source = readFileSync(path.join(appRoot, "global-error.tsx"), "utf8");

    expect(source).toContain("<html");
    expect(source).toContain("<body");
    expect(source).not.toContain("className=");
  });
});
