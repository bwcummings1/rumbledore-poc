import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Button, buttonVariants } from "./button";

test("Button keeps legacy variants mapped to AUSPEX variants", () => {
  expect(buttonVariants({ variant: "default" })).toContain("var(--lilac-hi)");
  expect(buttonVariants({ variant: "secondary" })).toContain(
    "var(--steel-soft)",
  );
  expect(buttonVariants({ variant: "outline" })).toContain("var(--steel-soft)");
  expect(buttonVariants({ variant: "destructive" })).toContain(
    "text-destructive",
  );
});

test("Button supports block and loading states without firing clicks", () => {
  const onClick = vi.fn();

  render(
    <Button block={true} loading={true} onClick={onClick}>
      Place bet
    </Button>,
  );

  const button = screen.getByRole("button", { name: "Place bet" });
  expect(button.getAttribute("aria-busy")).toBe("true");
  expect(button.className).toContain("w-full");
  fireEvent.click(button);
  expect(onClick).not.toHaveBeenCalled();
});

test("Button requires icon-only buttons to have an accessible name", () => {
  expect(() =>
    render(
      <Button size="icon" type="button">
        X
      </Button>,
    ),
  ).toThrow(/Icon-only Button requires aria-label/);

  render(
    <Button aria-label="Close" size="icon" type="button">
      X
    </Button>,
  );
  expect(screen.getByRole("button", { name: "Close" })).toBeDefined();
});
