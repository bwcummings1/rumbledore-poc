import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Stepper } from "./stepper";

test("Stepper renders spinbutton and increment controls", () => {
  const onValueChange = vi.fn();

  render(
    <Stepper
      aria-label="Stake amount"
      max={100}
      min={0}
      onValueChange={onValueChange}
      value={25}
    />,
  );

  expect(
    screen.getByRole("spinbutton", { name: "Stake amount" }),
  ).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Increase" }));
  expect(onValueChange).toHaveBeenCalled();
});
