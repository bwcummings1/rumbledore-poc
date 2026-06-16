import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { TabLinks, Tabs } from "./tabs";

afterEach(() => {
  cleanup();
});

test("Tabs exposes tablist and hides inactive panels", () => {
  render(
    <Tabs
      defaultValue="league"
      items={[
        { label: "League", panel: <p>League panel</p>, value: "league" },
        { label: "Arena", panel: <p>Arena panel</p>, value: "arena" },
      ]}
      listLabel="Scope tabs"
    />,
  );

  expect(screen.getByRole("tablist", { name: "Scope tabs" })).toBeDefined();
  expect(screen.getByRole("tabpanel", { name: "League" })).toBeDefined();
});

test("TabLinks marks the active route and supports roving keyboard focus", () => {
  render(
    <TabLinks
      ariaLabel="News sections"
      items={[
        { active: true, href: "/news", label: "Front" },
        { href: "/news/injuries", label: "Injuries" },
      ]}
    />,
  );

  const tablist = screen.getByRole("tablist", { name: "News sections" });
  const front = within(tablist).getByRole("tab", { name: "Front" });
  const injuries = within(tablist).getByRole("tab", { name: "Injuries" });

  expect(front.getAttribute("aria-current")).toBe("page");
  fireEvent.keyDown(tablist, { key: "ArrowRight" });
  expect(document.activeElement).toBe(injuries);
});
