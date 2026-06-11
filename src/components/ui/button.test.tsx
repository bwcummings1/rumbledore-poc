import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Button } from "./button";

test("shadcn Button renders an accessible button with variant classes", () => {
  render(<Button variant="destructive">Place bet</Button>);
  const button = screen.getByRole("button", { name: "Place bet" });
  expect(button.className).toContain("text-destructive");
});
