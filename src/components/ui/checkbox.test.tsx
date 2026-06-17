import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Checkbox } from "./checkbox";

afterEach(() => {
  cleanup();
});

test("Checkbox renders labeled checkbox semantics", async () => {
  const onCheckedChange = vi.fn();

  render(
    <Checkbox
      label="Assert a structured fact"
      onCheckedChange={onCheckedChange}
    />,
  );

  const control = screen.getByRole("checkbox", {
    name: "Assert a structured fact",
  });
  expect(control.className).toContain("rounded-control");
  fireEvent.click(control);
  await waitFor(() => expect(onCheckedChange).toHaveBeenCalled());
});
