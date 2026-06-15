import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { postJson } from "@/app/onboarding/client-http";
import type { LoreSectionData } from "@/lore/member-ui";
import { LeagueLoreSubmitView } from "./league-lore-submit-view";

const mocks = vi.hoisted(() => ({
  postJson: vi.fn(),
}));

vi.mock("@/app/onboarding/client-http", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/app/onboarding/client-http")>();
  return {
    ...actual,
    postJson: mocks.postJson,
  };
});

const leagueId = "00000000-0000-4000-8000-000000000001";
const personId = "00000000-0000-4000-8000-000000000002";

const data: LoreSectionData = {
  activeSubject: null,
  canon: [],
  counts: {
    canon: 0,
    openVotes: 0,
    refuted: 0,
    total: 0,
  },
  league: {
    id: leagueId,
    name: "NHS Alumni Annual",
  },
  openVotes: [],
  subjectFilters: [],
  submitOptions: {
    people: [
      {
        id: personId,
        name: "Fixture Manager",
      },
    ],
    recordTypes: [
      {
        label: "highest single week score",
        recordType: "highest_single_week_score",
      },
    ],
    seasons: [
      {
        season: 2025,
        weeks: [1, 5],
      },
    ],
  },
  stewardReviewHref: `/leagues/${leagueId}/lore/steward`,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LeagueLoreSubmitView", () => {
  it("submits an opinion claim with optional subjects", async () => {
    mocks.postJson.mockResolvedValue({
      claimId: "claim-1",
      kind: "opinion",
      status: "vote",
      threadRootId: "claim-1",
      verification: "n_a",
      voteClosesAt: "2026-06-22T12:00:00.000Z",
    });

    render(<LeagueLoreSubmitView data={data} />);

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Worst trade ever" },
    });
    fireEvent.change(screen.getByLabelText("Statement"), {
      target: { value: "This trade lives in shame." },
    });
    fireEvent.change(screen.getByLabelText("Person"), {
      target: { value: personId },
    });
    fireEvent.change(screen.getByLabelText("Season"), {
      target: { value: "2025" },
    });
    fireEvent.change(screen.getByLabelText("Week"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(postJson).toHaveBeenCalledTimes(1));
    expect(postJson).toHaveBeenCalledWith(
      `/api/leagues/${leagueId}/lore/claims`,
      {
        body: "This trade lives in shame.",
        subjects: [
          { personId, subjectType: "person" },
          { season: 2025, subjectType: "week", week: 5 },
        ],
        title: "Worst trade ever",
      },
    );
    expect(
      await screen.findByText(/the league is voting until/i),
    ).toBeDefined();
  });

  it("submits a structured weekly fact assertion", async () => {
    mocks.postJson.mockResolvedValue({
      claimId: "claim-2",
      kind: "data_verifiable",
      ratifiedBy: "verified",
      status: "canonized",
      threadRootId: "claim-2",
      verification: "verified",
      verificationResult: {
        actualValue: "200.4",
        assertedValue: "200.4",
        result: "match",
      },
    });

    render(<LeagueLoreSubmitView data={data} />);

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Week 5 nuclear score" },
    });
    fireEvent.change(screen.getByLabelText("Statement"), {
      target: { value: "The 200-point week is real." },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /assert a structured fact/i }),
    );
    fireEvent.change(screen.getAllByLabelText("Week")[1], {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("Asserted value"), {
      target: { value: "200.4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(postJson).toHaveBeenCalledTimes(1));
    expect(postJson).toHaveBeenCalledWith(
      `/api/leagues/${leagueId}/lore/claims`,
      {
        assertions: [
          {
            assertedValue: 200.4,
            metric: "points_for",
            personId,
            scoringPeriod: 5,
            season: 2025,
            source: "weekly_statistics",
          },
        ],
        body: "The 200-point week is real.",
        subjects: [],
        title: "Week 5 nuclear score",
      },
    );
    expect(await screen.findByText(/on the record/i)).toBeDefined();
  });
});
