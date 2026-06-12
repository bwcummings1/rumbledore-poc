import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { InviteAcceptPanel } from "./invite-accept-panel";

afterEach(() => {
  vi.restoreAllMocks();
});

test("invite accept panel sends unauthenticated users to provider onboarding", () => {
  render(
    <InviteAcceptPanel
      acceptUrl="/api/invite/league/token/accept"
      isAuthenticated={false}
      onboardingUrl="/onboarding/espn"
    />,
  );

  expect(
    screen
      .getByRole("link", { name: /connect fantasy account/i })
      .getAttribute("href"),
  ).toBe("/onboarding/espn");
  expect(screen.getByRole("link", { name: "Home" }).getAttribute("href")).toBe(
    "/",
  );
});

test("invite accept panel posts acceptance and surfaces claim errors", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify({}), { status: 409 }));

  render(
    <InviteAcceptPanel
      acceptUrl="/api/invite/league/token/accept"
      isAuthenticated={true}
      onboardingUrl="/onboarding/espn"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /accept invite/i }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/invite/league/token/accept",
      expect.objectContaining({ method: "POST" }),
    );
  });
  expect(screen.getByRole("alert").textContent).toContain(
    "already been claimed",
  );
});
