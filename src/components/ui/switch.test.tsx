import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Switch } from "./switch";

test("Switch renders a labeled switch and reports changes", () => {
  const onCheckedChange = vi.fn();

  render(<Switch label="Notifications" onCheckedChange={onCheckedChange} />);

  fireEvent.click(screen.getByRole("switch", { name: "Notifications" }));
  expect(onCheckedChange).toHaveBeenCalled();
});
