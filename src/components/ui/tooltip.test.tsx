import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Tooltip } from "./tooltip";

test("Tooltip renders non-essential hover and focus help", () => {
  render(
    <Tooltip defaultOpen={true} trigger={<button type="button">Odds</button>}>
      Locked when the slip is submitted.
    </Tooltip>,
  );

  expect(screen.getByRole("tooltip").textContent).toContain("Locked");
});
