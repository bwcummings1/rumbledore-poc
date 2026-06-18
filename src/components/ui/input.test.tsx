import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Input } from "./input";

test("Input renders the AUSPEX shell with optional clear affordance", () => {
  const onClear = vi.fn();

  render(
    <Input
      aria-label="Stake"
      clearable={true}
      onClear={onClear}
      tone="money"
      value="25.00"
    />,
  );

  expect(screen.getByLabelText("Stake").className).toContain("metric");
  expect(screen.getByLabelText("Stake").className).toContain("min-h-11");
  expect(screen.getByLabelText("Stake").className).toContain("pr-12");
  const clear = screen.getByRole("button", { name: "Clear" });
  expect(clear.className).toContain("size-11");
  fireEvent.click(clear);
  expect(onClear).toHaveBeenCalledTimes(1);
});
