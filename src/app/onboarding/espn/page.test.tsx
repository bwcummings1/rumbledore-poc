import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import EspnOnboardingPage from "./page";

test("ESPN onboarding page renders the connect controls", async () => {
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
});
