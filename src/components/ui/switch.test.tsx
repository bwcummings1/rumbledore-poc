import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Switch } from "./switch";

test("Switch renders a labeled switch and reports changes", () => {
  const onCheckedChange = vi.fn();

  render(<Switch label="Notifications" onCheckedChange={onCheckedChange} />);

  const control = screen.getByRole("switch", { name: "Notifications" });
  expect(control.className).toContain("rounded-full");
  fireEvent.click(control);
  expect(onCheckedChange).toHaveBeenCalled();
});
