import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import EspnOnboardingPage from "./page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("ESPN onboarding page renders the connect controls", async () => {
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

  render(await EspnOnboardingPage());
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: /bring your league into rumbledore/i,
    }),
  ).toBeDefined();
  expect(screen.getByRole("button", { name: /connect espn/i })).toBeDefined();
  expect(
    screen.getByRole("button", { name: /validate cookies/i }),
  ).toBeDefined();
  expect(
    await screen.findByText(/no fantasy football leagues found yet/i),
  ).toBeDefined();
});
