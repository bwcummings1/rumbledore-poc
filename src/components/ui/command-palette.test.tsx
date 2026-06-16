import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { CommandPalette } from "./command-palette";

const items = [
  {
    group: "Global",
    href: "/news",
    id: "news",
    label: "News",
    keywords: ["central"],
  },
  {
    group: "League",
    href: "/leagues/league-a/bet",
    id: "bet",
    label: "Bet",
  },
] as const;

afterEach(() => {
  cleanup();
});

test("CommandPalette filters results and runs the highlighted item", () => {
  const onSelect = vi.fn();

  render(
    <CommandPalette defaultOpen={true} items={items} onSelect={onSelect} />,
  );

  const dialog = screen.getByRole("dialog", { name: "Command palette" });
  const input = within(dialog).getByRole("combobox", {
    name: "Command search",
  });

  expect(within(dialog).getByRole("option", { name: /News/ })).toBeDefined();
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Enter" });

  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "bet" }));
});

test("CommandPalette opens from Ctrl K and renders empty state", () => {
  render(<CommandPalette items={items} />);

  fireEvent.keyDown(window, { ctrlKey: true, key: "k" });
  const dialog = screen.getByRole("dialog", { name: "Command palette" });
  const input = within(dialog).getByRole("combobox", {
    name: "Command search",
  });

  fireEvent.change(input, { target: { value: "missing" } });

  expect(within(dialog).getByText("No matches")).toBeDefined();
  expect(within(dialog).getByText(/No command matches/)).toBeDefined();
});
