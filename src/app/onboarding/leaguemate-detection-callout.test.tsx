import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { LeaguemateDetectionCallout } from "./leaguemate-detection-callout";

const summary = {
  importedMembers: 12,
  inviteTargets: 2,
  stewardReview: {
    href: "/leagues/00000000-0000-4000-8000-000000000001/members/steward#identity-review",
    needsReview: true,
    suggestedIdentityLinks: 1,
    unresolvedIntegrityChecks: 1,
  },
  targets: [
    {
      displayName: "Fixture Manager Two",
      providerMemberId: "provider-member-2",
      suggestedChannel: "share" as const,
      teamNames: ["Fixture Team 02"],
    },
    {
      displayName: "Fixture Manager Three",
      providerMemberId: "provider-member-3",
      suggestedChannel: "sms" as const,
      teamNames: ["Fixture Team 03"],
    },
  ],
};

test("leaguemate callout deep-links flagged data review", () => {
  render(
    <LeaguemateDetectionCallout
      leagueId="00000000-0000-4000-8000-000000000001"
      summary={summary}
    />,
  );

  expect(screen.getByText("We found your 2 leaguemates.")).toBeDefined();
  expect(
    screen
      .getByRole("link", { name: "2 data review items" })
      .getAttribute("href"),
  ).toBe(
    "/leagues/00000000-0000-4000-8000-000000000001/members/steward#identity-review",
  );
  expect(
    screen.getByRole("link", { name: "Invite roster" }).getAttribute("href"),
  ).toBe("/leagues/00000000-0000-4000-8000-000000000001/members");
});
