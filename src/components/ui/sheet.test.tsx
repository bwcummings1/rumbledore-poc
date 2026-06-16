import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Sheet } from "./sheet";

test("Sheet renders drawer dialog semantics and keyboard snap control", () => {
  render(
    <Sheet defaultOpen={true} title="Bet slip">
      <p>Two legs selected.</p>
    </Sheet>,
  );

  const sheet = screen.getByRole("dialog", { name: "Bet slip" });
  expect(sheet.getAttribute("data-slot")).toBe("sheet");
  expect(sheet.getAttribute("data-snap")).toBe("half");

  fireEvent.keyDown(screen.getByRole("button", { name: "Resize Bet slip" }), {
    key: "ArrowUp",
  });
  expect(sheet.getAttribute("data-snap")).toBe("full");
});
