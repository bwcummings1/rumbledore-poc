import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Ladder } from "./ladder";

test("Ladder names each rank pip and marks the current league", () => {
  render(
    <Ladder
      label="League ranks"
      pips={[
        { id: "a", label: "Alpha", rank: 1 },
        { id: "b", isCurrent: true, label: "Beta", rank: 2 },
      ]}
    />,
  );

  expect(screen.getByRole("list", { name: "League ranks" })).toBeDefined();
  expect(
    screen
      .getByLabelText("Rank 2: Beta, current league")
      .getAttribute("aria-current"),
  ).toBe("true");
});
