import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { StatusPill } from "./status-pill";

test("StatusPill renders tone data and a non-color signal", () => {
  render(<StatusPill tone="live">Live</StatusPill>);

  const pill = screen.getByText("Live").closest("[data-slot='status-pill']");
  expect(pill?.getAttribute("data-tone")).toBe("live");
  expect(pill?.querySelector("svg")).toBeDefined();
});
