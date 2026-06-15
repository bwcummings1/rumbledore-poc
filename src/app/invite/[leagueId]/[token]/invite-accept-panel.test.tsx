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
      claimMode="targeted"
      claimTargets={[]}
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
      claimMode="targeted"
      claimTargets={[]}
      isAuthenticated={true}
      onboardingUrl="/onboarding/espn"
    />,
  );

  const button = screen.getByRole("button", { name: /accept invite/i });
  fireEvent.click(button);

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/invite/league/token/accept",
      expect.objectContaining({ method: "POST" }),
    );
  });
  expect((await screen.findByRole("alert")).textContent).toContain(
    "already been claimed",
  );
  await waitFor(() => {
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });
});

test("open invite accept panel posts the selected provider member", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify({}), { status: 409 }));

  render(
    <InviteAcceptPanel
      acceptUrl="/api/invite/league/token/accept"
      claimMode="open"
      claimTargets={[
        {
          displayName: "Fixture Manager Two",
          providerMemberId: "member-two",
          teamNames: ["Fixture Team 02"],
        },
        {
          displayName: "Fixture Manager Three",
          providerMemberId: "member-three",
          teamNames: ["Fixture Team 03"],
        },
      ]}
      isAuthenticated={true}
      onboardingUrl="/onboarding/espn"
    />,
  );

  fireEvent.click(screen.getByLabelText(/Fixture Team 03/i));
  fireEvent.click(screen.getByRole("button", { name: /claim team/i }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/invite/league/token/accept",
      expect.objectContaining({
        body: JSON.stringify({ providerMemberId: "member-three" }),
        method: "POST",
      }),
    );
  });
});
