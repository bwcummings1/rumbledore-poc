import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Chip } from "./chip";

test("Chip renders selectable and removable affordances", () => {
  const onClick = vi.fn();
  const onRemove = vi.fn();

  render(
    <Chip
      onClick={onClick}
      onRemove={onRemove}
      removableLabel="Remove stake chip"
      selected={true}
    >
      Max
    </Chip>,
  );

  const chip = screen.getByRole("button", { name: "Max" });
  expect(chip.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(chip);
  fireEvent.click(screen.getByRole("button", { name: "Remove stake chip" }));
  expect(onClick).toHaveBeenCalledTimes(1);
  expect(onRemove).toHaveBeenCalledTimes(1);
});
