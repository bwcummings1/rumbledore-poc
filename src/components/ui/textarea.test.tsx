import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Textarea } from "./textarea";

test("Textarea renders a bounded AUSPEX field and optional count", () => {
  render(
    <Textarea
      aria-label="Statement"
      maxLength={40}
      showCount={true}
      value="Canon claim"
    />,
  );

  expect(screen.getByLabelText("Statement").className).toContain("min-h-24");
  expect(screen.getByText("11/40")).toBeDefined();
});
