import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Capacity } from "./capacity";

test("Capacity announces used and total counts", () => {
  const { container } = render(
    <Capacity label="Weeks survived" total={4} used={3} />,
  );

  const meter = screen.getByRole("meter", { name: "Weeks survived" });
  expect(meter.getAttribute("aria-valuetext")).toBe("3 of 4");
  expect(
    container.querySelectorAll("[data-slot='capacity-cell']"),
  ).toHaveLength(4);
});
