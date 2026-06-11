import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import ErrorBoundary from "./error";

test("root error boundary renders a safe fallback and reset action", () => {
  const reset = vi.fn();

  render(<ErrorBoundary error={new Error("boom")} reset={reset} />);

  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "Something went wrong",
    }),
  ).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: /try again/i }));
  expect(reset).toHaveBeenCalledTimes(1);
});
