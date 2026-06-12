import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import Home from "./page";

test("home page renders the product name and pitch", () => {
  render(<Home />);
  expect(
    screen.getByRole("heading", { level: 1, name: "Rumbledore" }),
  ).toBeDefined();
  expect(screen.getByText(/home base/i)).toBeDefined();
  expect(
    screen.getByRole("link", { name: "Connect Sleeper" }).getAttribute("href"),
  ).toBe("/onboarding/sleeper");
  expect(
    screen.getByRole("link", { name: "Connect Yahoo" }).getAttribute("href"),
  ).toBe("/onboarding/yahoo");
  expect(
    screen.getByRole("link", { name: "Central news" }).getAttribute("href"),
  ).toBe("/news");
  expect(screen.getByRole("link", { name: "Arena" }).getAttribute("href")).toBe(
    "/arena",
  );
});
