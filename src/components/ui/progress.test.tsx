import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Progress } from "./progress";

test("Progress exposes determinate value through progressbar aria", () => {
  render(<Progress label="Win rate" showValue={true} value={60} />);

  const progress = screen.getByRole("progressbar", { name: "Win rate" });
  expect(progress.getAttribute("aria-valuenow")).toBe("60");
  expect(screen.getByText("60%")).toBeDefined();
});

test("Progress omits value metadata when indeterminate", () => {
  render(<Progress label="Loading arena standings" />);

  const progress = screen.getByRole("progressbar", {
    name: "Loading arena standings",
  });
  expect(progress.getAttribute("aria-valuenow")).toBeNull();
});
