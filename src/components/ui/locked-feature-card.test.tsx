import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";

import { Button } from "./button";
import { LockedFeatureCard, UpgradeSurface } from "./locked-feature-card";

test("LockedFeatureCard maps entitlement reasons to distinct gated copy", () => {
  render(
    <LockedFeatureCard
      action={<Button variant="amber">Review upgrade options</Button>}
      feature="league-cast"
      preview={<button type="button">Hidden preview action</button>}
      previewLabel="A text alternative for the hidden cast preview."
      reasonCode="TIER_REQUIRED"
    />,
  );

  expect(
    screen.getByRole("heading", { name: "Unlock the cast for your league" }),
  ).toBeDefined();
  expect(screen.getByText("Premium league")).toBeDefined();
  expect(
    screen.getByText(/Standings, history, records, betting, and reading/i),
  ).toBeDefined();
  expect(
    screen.getByText("A text alternative for the hidden cast preview."),
  ).toBeDefined();
  expect(screen.queryByRole("button", { name: "Hidden preview action" })).toBe(
    null,
  );
  expect(
    screen.getByRole("button", { name: "Review upgrade options" }),
  ).toBeDefined();
});

test("LockedFeatureCard renders cap exhaustion as a calm note", () => {
  render(<LockedFeatureCard feature="league-cast" reasonCode="CAP_EXCEEDED" />);

  expect(
    screen.getByRole("heading", {
      name: "The cast pauses until the next window",
    }),
  ).toBeDefined();
  expect(screen.getAllByText("Weekly limit reached").length).toBeGreaterThan(0);
  expect(screen.getByRole("status")).toBeDefined();
});

test("UpgradeSurface explains capability sets without prices", () => {
  render(
    <UpgradeSurface>
      Entitlements are granted by admins until checkout exists.
    </UpgradeSurface>,
  );

  const surface = screen.getByRole("region", { name: "Upgrade options" });
  expect(within(surface).getByText("Free league")).toBeDefined();
  expect(within(surface).getByText("Premium league")).toBeDefined();
  expect(within(surface).getByText("Individual")).toBeDefined();
  expect(surface.textContent).not.toMatch(/\$\d/);
});
