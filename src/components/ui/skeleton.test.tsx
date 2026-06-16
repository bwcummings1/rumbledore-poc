import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Skeleton } from "./skeleton";

test("Skeleton hides placeholder blocks from assistive tech", () => {
  render(<Skeleton data-testid="ghost-row" variant="table-row" />);

  const skeleton = screen.getByTestId("ghost-row");
  expect(skeleton.getAttribute("aria-hidden")).toBe("true");
  expect(skeleton.getAttribute("data-variant")).toBe("table-row");
});
