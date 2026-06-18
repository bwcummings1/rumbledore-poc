import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Switch } from "./switch";

test("Switch renders a labeled switch and reports changes", () => {
  const onCheckedChange = vi.fn();

  render(<Switch label="Notifications" onCheckedChange={onCheckedChange} />);

  const control = screen.getByRole("switch", { name: "Notifications" });
  expect(control.className).toContain("rounded-full");
  expect(control.className).toContain("min-h-11");
  expect(control.className).toContain("min-w-11");
  fireEvent.click(control);
  expect(onCheckedChange).toHaveBeenCalled();
});
