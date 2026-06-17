import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Segmented } from "./segmented";

test("Segmented renders radio options and reports selection", () => {
  const onValueChange = vi.fn();

  render(
    <Segmented
      aria-label="Fact source"
      onValueChange={onValueChange}
      options={[
        { label: "Season", value: "season" },
        { label: "Week", value: "week" },
      ]}
      value="season"
    />,
  );

  const option = screen.getByRole("radio", { name: "Week" });
  expect(option.className).toContain("rounded-full");
  fireEvent.click(option);
  expect(onValueChange).toHaveBeenCalledWith("week", expect.any(Object));
});
