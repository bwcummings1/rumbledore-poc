import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Presence } from "./presence";

test("Presence pairs its colored dot with an accessible text equivalent", () => {
  render(<Presence status="live" />);

  expect(screen.getByLabelText("live")).toBeDefined();
  expect(screen.getByText("live").className).toContain("sr-only");
});
