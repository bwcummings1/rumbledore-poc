import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Pagination, paginationRange } from "./pagination";

const pages = Array.from({ length: 12 }, (_, index) => ({
  href: `/arena?page=${index + 1}`,
  page: index + 1,
}));

test("Pagination marks the current page and disables bounds", () => {
  render(<Pagination currentPage={1} pages={pages} />);

  expect(
    screen.getByRole("link", { name: "Page 1" }).getAttribute("aria-current"),
  ).toBe("page");
  expect(
    screen
      .getAllByRole("button", { name: "Previous page" })[0]
      .getAttribute("aria-disabled"),
  ).toBe("true");
  expect(
    screen.getAllByRole("button", { name: "Previous page" })[0]?.className,
  ).toContain("size-11");
  expect(screen.getAllByRole("link", { name: "Next page" }).length).toBe(2);
  expect(screen.getByLabelText("Jump to page")).toBeDefined();
});

test("paginationRange keeps edges and ellipses for long ranges", () => {
  expect(
    paginationRange({
      currentPage: 6,
      pageNumbers: pages.map((page) => page.page),
      siblingCount: 1,
    }),
  ).toEqual([1, "ellipsis-left", 5, 6, 7, "ellipsis-right", 12]);
});
