import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Banner } from "./banner";
import { Button } from "./button";

test("Banner renders a page-level notice with CTA and dismiss", () => {
  const onDismiss = vi.fn();

  render(
    <Banner
      action={<Button size="sm">Upgrade</Button>}
      onDismiss={onDismiss}
      title="Premium locked"
      tone="warn"
    >
      Unlock the arena console.
    </Banner>,
  );

  const banner = screen.getByRole("alert");
  expect(banner.getAttribute("data-slot")).toBe("banner");
  expect(screen.getByRole("button", { name: "Upgrade" })).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Dismiss banner" }));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

test("Banner uses polite status semantics for informational notices", () => {
  render(
    <Banner title="Offline" tone="info">
      Cached pages remain readable.
    </Banner>,
  );

  expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
});
