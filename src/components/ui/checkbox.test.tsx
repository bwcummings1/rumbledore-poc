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

  fireEvent.click(
    screen.getByRole("checkbox", { name: "Assert a structured fact" }),
  );
  await waitFor(() => expect(onCheckedChange).toHaveBeenCalled());
});
