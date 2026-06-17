import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { RadioGroup } from "./radio";

test("RadioGroup renders row options and reports selection", () => {
  const onValueChange = vi.fn();

  render(
    <RadioGroup
      aria-label="Asserted value"
      onValueChange={onValueChange}
      options={[
        { label: "True", value: "true" },
        { label: "False", value: "false" },
      ]}
      value="true"
    />,
  );

  const control = screen.getByRole("radio", { name: "False" });
  expect(control.className).toContain("rounded-full");
  fireEvent.click(control);
  expect(onValueChange).toHaveBeenCalledWith("false", expect.any(Object));
});
