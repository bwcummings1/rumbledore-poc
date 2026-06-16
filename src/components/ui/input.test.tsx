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
  fireEvent.click(screen.getByRole("button", { name: "Clear" }));
  expect(onClear).toHaveBeenCalledTimes(1);
});
