import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import YahooOnboardingPage from "./page";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("Yahoo onboarding page renders OAuth connect controls", () => {
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

  render(<YahooOnboardingPage />);
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: /bring your yahoo league into rumbledore/i,
    }),
  ).toBeDefined();
  expect(screen.getByRole("button", { name: /connect yahoo/i })).toBeDefined();
});
