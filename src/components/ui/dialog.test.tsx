import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test } from "vitest";

import { Button } from "./button";
import { Dialog } from "./dialog";

test("Dialog renders modal semantics and closes on Escape", async () => {
  render(
    <Dialog
      defaultOpen={true}
      description="This action can be reviewed."
      footer={<Button>Confirm</Button>}
      title="Confirm import"
    >
      <p>Import the selected league.</p>
    </Dialog>,
  );

  const dialog = screen.getByRole("dialog", { name: "Confirm import" });
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  expect(screen.getByText("This action can be reviewed.")).toBeDefined();

  fireEvent.keyDown(dialog, { key: "Escape" });
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Confirm import" })).toBeNull(),
  );
});
