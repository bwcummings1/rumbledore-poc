import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Steps } from "./steps";

test("Steps exposes current wizard progress with text status", () => {
  render(
    <Steps
      steps={[
        { id: "connect", label: "Connect", status: "complete" },
        { id: "discover", label: "Discover", status: "current" },
        { id: "invite", label: "Invite", status: "upcoming" },
      ]}
    />,
  );

  expect(screen.getByText("Step 2 of 3")).toBeDefined();
  const currentStep = screen
    .getAllByText("Discover")
    .find((element) => element.closest("li"));
  expect(currentStep?.closest("li")?.getAttribute("aria-current")).toBe("step");
  expect(screen.getByText("1. Complete")).toBeDefined();
  expect(screen.getByText("3. Upcoming")).toBeDefined();
});
