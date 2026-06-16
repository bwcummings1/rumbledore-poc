import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Alert } from "./alert";
import { Button } from "./button";

test("Alert maps urgent tones to assertive alert semantics", () => {
  const onDismiss = vi.fn();

  render(
    <Alert
      actions={<Button size="sm">Retry</Button>}
      onDismiss={onDismiss}
      title="Provider failed"
      tone="danger"
    >
      Reconnect ESPN before importing.
    </Alert>,
  );

  const alert = screen.getByRole("alert");
  expect(alert.getAttribute("aria-live")).toBe("assertive");
  expect(alert.getAttribute("data-tone")).toBe("danger");
  expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Dismiss alert" }));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

test("Alert uses polite status semantics for informational feedback", () => {
  render(<Alert tone="ok">League import finished.</Alert>);

  const status = screen.getByRole("status");
  expect(status.getAttribute("aria-live")).toBe("polite");
  expect(status.getAttribute("data-tone")).toBe("ok");
});
