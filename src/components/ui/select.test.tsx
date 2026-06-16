import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Select } from "./select";

test("Select renders combobox trigger and selectable items", () => {
  const onValueChange = vi.fn();

  render(
    <Select
      aria-label="Provider"
      onValueChange={onValueChange}
      options={[
        { label: "ESPN", value: "espn" },
        { label: "Sleeper", value: "sleeper" },
      ]}
      value="espn"
    />,
  );

  fireEvent.change(screen.getByRole("combobox", { name: "Provider" }), {
    target: { value: "sleeper" },
  });
  expect(onValueChange).toHaveBeenCalledWith("sleeper");
});
