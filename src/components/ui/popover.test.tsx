import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Popover } from "./popover";

test("Popover renders a labelled rich panel", () => {
  render(
    <Popover
      defaultOpen={true}
      title="Market filters"
      trigger={<button type="button">Filters</button>}
    >
      <button type="button">Only props</button>
    </Popover>,
  );

  expect(screen.getByRole("dialog", { name: "Market filters" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Only props" })).toBeDefined();
});
