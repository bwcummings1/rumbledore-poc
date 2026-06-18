import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Slider } from "./slider";

test("Slider renders accessible slider thumb and value output", () => {
  const { container } = render(
    <Slider aria-label="Stake amount slider" max={100} min={0} value={25} />,
  );

  expect(
    screen.getByRole("slider", { name: "Stake amount slider" }),
  ).toBeDefined();
  expect(container.querySelector(".size-11")).toBeDefined();
  expect(screen.getByText("25")).toBeDefined();
});
