import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";

import { Breadcrumbs } from "./breadcrumbs";

test("Breadcrumbs renders the current page and exposes hidden mobile crumbs", async () => {
  render(
    <Breadcrumbs
      items={[
        { href: "/", label: "Rumbledore" },
        { href: "/leagues/league-a", label: "NHS Alumni Annual" },
        { href: "/leagues/league-a/press", label: "The Press" },
        { current: true, label: "Week 1 column" },
      ]}
    />,
  );

  const nav = screen.getByLabelText("Breadcrumb");
  expect(
    within(nav).getByText("Week 1 column").getAttribute("aria-current"),
  ).toBe("page");
  expect(within(nav).getByText("Week 1 column").className).toContain(
    "min-h-11",
  );

  fireEvent.click(
    within(nav).getByRole("button", { name: "Show hidden breadcrumbs" }),
  );

  const dialog = await screen.findByRole("dialog", { name: "Path" });
  expect(
    within(dialog).getByRole("link", { name: "NHS Alumni Annual" }),
  ).toBeDefined();
});
