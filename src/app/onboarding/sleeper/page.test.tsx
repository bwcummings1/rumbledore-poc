import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import SleeperOnboardingPage from "./page";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("Sleeper onboarding page renders public connect controls", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify([]), {
          headers: { "content-type": "application/json" },
        }),
      ),
    ),
  );

  render(await SleeperOnboardingPage());
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: /bring your sleeper league into rumbledore/i,
    }),
  ).toBeDefined();
  expect(screen.getByRole("button", { name: /find leagues/i })).toBeDefined();
});
