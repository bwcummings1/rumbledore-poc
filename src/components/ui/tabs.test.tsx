import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { TabLinks, TabLinksPanelGroup } from "./tabs";
import { Tabs } from "./tabs-root";

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

test("TabLinksPanelGroup switches local panels and supports arrow-key activation", () => {
  render(
    <TabLinksPanelGroup
      ariaLabel="League home sections"
      defaultValue="press"
      header={<p>League header</p>}
      items={[
        {
          label: "Press",
          panel: <p>Press panel</p>,
          value: "press",
        },
        {
          label: "Standings",
          panel: <p>Standings panel</p>,
          value: "standings",
        },
      ]}
    />,
  );

  const tablist = screen.getByRole("tablist", {
    name: "League home sections",
  });
  const press = within(tablist).getByRole("tab", { name: "Press" });
  const standings = within(tablist).getByRole("tab", { name: "Standings" });

  expect(screen.getByText("League header")).toBeDefined();
  expect(press.getAttribute("aria-selected")).toBe("true");
  expect(screen.getByText("Press panel")).toBeDefined();
  expect(screen.queryByText("Standings panel")).toBeNull();

  press.focus();
  fireEvent.keyDown(tablist, { key: "ArrowRight" });

  expect(document.activeElement).toBe(standings);
  expect(standings.getAttribute("aria-selected")).toBe("true");
  expect(screen.getByText("Standings panel")).toBeDefined();
  expect(screen.queryByText("Press panel")).toBeNull();
});
