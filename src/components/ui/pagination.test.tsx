import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { Pagination, paginationRange } from "./pagination";

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  router.push.mockClear();
});

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

test("the mobile page jump routes with the app router instead of reloading", () => {
  const assign = vi.fn();
  vi.stubGlobal("location", { ...window.location, assign });

  render(<Pagination currentPage={1} pages={pages} />);

  fireEvent.change(screen.getByLabelText("Jump to page"), {
    target: { value: "4" },
  });

  expect(router.push).toHaveBeenCalledWith("/arena?page=4");
  expect(assign).not.toHaveBeenCalled();
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
