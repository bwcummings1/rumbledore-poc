import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SearchInput } from "./search-input";

test("SearchInput exposes a searchbox and clears on Escape", () => {
  const onClear = vi.fn();

  render(
    <SearchInput
      aria-label="Search leagues"
      onClear={onClear}
      value="sleeper"
    />,
  );

  const input = screen.getByRole("searchbox", { name: "Search leagues" });
  fireEvent.keyDown(input, { key: "Escape" });
  expect(onClear).toHaveBeenCalledTimes(1);
});
