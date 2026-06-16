import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Field } from "./field";
import { Input } from "./input";

test("Field wires label, hint, and error state into its control", () => {
  render(
    <Field error="Required" hint="Use the league name." label="League name">
      {({ controlProps }) => <Input {...controlProps} />}
    </Field>,
  );

  const input = screen.getByLabelText("League name");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(input.getAttribute("aria-describedby")).toContain("hint");
  expect(input.getAttribute("aria-describedby")).toContain("error");
  expect(screen.getByText("Use the league name.")).toBeDefined();
  expect(screen.getByText("Required")).toBeDefined();
});
