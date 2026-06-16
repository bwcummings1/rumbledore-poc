import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Badge, formatBadgeValue } from "./badge";

test("Badge caps large counts and keeps an accessible label", () => {
  render(<Badge label="120 unread" value={120} />);

  expect(formatBadgeValue(120, 99)).toBe("99+");
  expect(screen.getByLabelText("120 unread").textContent).toBe("99+");
});

test("Badge supports dot-only activity state", () => {
  render(<Badge label="Has fresh wire items" variant="dot" />);

  expect(screen.getByLabelText("Has fresh wire items").textContent).toBe("");
});
