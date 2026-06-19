import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { SectionTabs } from "./section-tabs";

afterEach(() => {
  cleanup();
});

test("SectionTabs renders link tabs with current-page state", () => {
  render(
    <SectionTabs
      ariaLabel="Arena sections"
      items={[
        {
          active: true,
          description: "Main standings",
          href: "/arena",
          label: "Leaderboard",
          value: "leaderboard",
        },
        {
          href: "/arena/movers",
          label: "Movers",
          value: "movers",
        },
      ]}
      mode="links"
      title="Arena Sections"
    />,
  );

  const tablist = screen.getByRole("tablist", { name: "Arena sections" });
  const leaderboard = within(tablist).getByRole("tab", {
    name: "Leaderboard",
  });

  expect(leaderboard.getAttribute("aria-current")).toBe("page");
  expect(leaderboard.getAttribute("href")).toBe("/arena");
  expect(screen.getByText("Main standings")).toBeDefined();
});

test("SectionTabs switches local panels and supports arrow-key activation", () => {
  render(
    <SectionTabs
      ariaLabel="League home sections"
      defaultValue="press"
      items={[
        {
          description: "Press front",
          label: "Press",
          panel: <p>Press panel</p>,
          value: "press",
        },
        {
          description: "Standings table",
          label: "Standings",
          panel: <p>Standings panel</p>,
          value: "standings",
        },
      ]}
      mode="panels"
      title="League Home Sections"
    />,
  );

  const tablist = screen.getByRole("tablist", {
    name: "League home sections",
  });
  const press = within(tablist).getByRole("tab", { name: "Press" });
  const standings = within(tablist).getByRole("tab", { name: "Standings" });

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
