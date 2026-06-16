import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Edge } from "./edge";

test("Edge pairs value tone with a visible sign signal", () => {
  render(<Edge eyebrow="ROI" tone="positive" value="+12%" />);

  expect(screen.getByText("ROI")).toBeDefined();
  expect(screen.getByText("+12%")).toBeDefined();
  expect(screen.getAllByText("+").length).toBe(1);
});
