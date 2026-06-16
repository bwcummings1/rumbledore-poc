import { render, screen } from "@testing-library/react";
import { LockKeyhole } from "lucide-react";
import { expect, test } from "vitest";

import { Button } from "./button";
import { EmptyState } from "./empty-state";

test("EmptyState renders distinct empty and gated copy with CTA", () => {
  render(
    <EmptyState
      action={<Button variant="amber">Upgrade</Button>}
      icon={<LockKeyhole />}
      title="Arena locked"
      variant="gated"
    >
      Premium leagues get the full inter-league board.
    </EmptyState>,
  );

  const state = screen.getByRole("status");
  expect(state.getAttribute("data-variant")).toBe("gated");
  expect(screen.getByRole("heading", { name: "Arena locked" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Upgrade" })).toBeDefined();
});
