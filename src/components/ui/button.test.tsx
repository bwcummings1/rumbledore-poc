import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Button, buttonVariants } from "./button";

test("Button keeps legacy variants mapped to AUSPEX variants", () => {
  expect(buttonVariants({ variant: "default" })).toContain("btn-primary");
  expect(buttonVariants({ variant: "secondary" })).toContain("btn-steel");
  expect(buttonVariants({ variant: "outline" })).toContain("btn-steel");
  expect(buttonVariants({ variant: "destructive" })).toContain("btn-danger");
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
  expect(button.className).toContain("btn-block");
  fireEvent.click(button);
  expect(onClick).not.toHaveBeenCalled();
});

test("Button sizes map to reference-dense AUSPEX size classes", () => {
  expect(buttonVariants({ size: "default" })).toContain("btn-md");
  expect(buttonVariants({ size: "sm" })).toContain("btn-sm");
  expect(buttonVariants({ size: "xs" })).toContain("btn-sm");
  expect(buttonVariants({ size: "icon-sm" })).toContain("btn-icon");
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
