import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { useToast } from "./toast";
import { Toaster } from "./toaster";

function NotifyButton() {
  const { notify } = useToast();

  return (
    <button
      onClick={() =>
        notify({
          description: "Review the updated price before placing.",
          title: "Line moved",
          tone: "warn",
        })
      }
      type="button"
    >
      Notify
    </button>
  );
}

test("Toaster exposes a live notification stack", async () => {
  render(
    <Toaster>
      <NotifyButton />
    </Toaster>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Notify" }));

  expect((await screen.findAllByText("Line moved")).length).toBeGreaterThan(0);
  expect(document.querySelector('[data-slot="toast"]')).toBeDefined();
});
