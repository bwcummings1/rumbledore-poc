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

  fireEvent.click(screen.getByRole("radio", { name: "False" }));
  expect(onValueChange).toHaveBeenCalledWith("false", expect.any(Object));
});
