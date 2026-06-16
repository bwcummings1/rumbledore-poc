import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { StatTile } from "./stat-tile";

test("StatTile groups a labelled display value with caption and delta", () => {
  render(
    <StatTile
      caption="Updated after settlement"
      delta="+2"
      label="Arena pulse"
      tone="lilac"
      value="Live"
    />,
  );

  expect(screen.getByRole("group", { name: "Arena pulse" })).toBeDefined();
  expect(screen.getByText("Live").className).toContain("lcd-live");
  expect(screen.getByText("+2")).toBeDefined();
});
