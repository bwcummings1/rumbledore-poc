import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import {
  CanonizedMoment,
  CastOrbStatus,
  CountUpValue,
  completeSpectacleEvent,
  createSpectacleConductorState,
  enqueueSpectacleEvents,
  ScoreboardStrip,
  type SpectacleEvent,
  SpectacleStinger,
  shouldFireRecordBrokenStinger,
  VoteThresholdMeter,
  WireTicker,
} from "./spectacle";

afterEach(() => {
  cleanup();
});

const headlinerWin = {
  dedupeKey: "bet-settled:slip-1",
  id: "win-1",
  kind: "big-win",
  severity: "headliner",
} satisfies SpectacleEvent;

const headlinerRecord = {
  dedupeKey: "record:single-week",
  id: "record-1",
  kind: "record-broken",
  severity: "headliner",
} satisfies SpectacleEvent;

const transientToast = {
  dedupeKey: "toast:cast-piece",
  id: "toast-1",
  kind: "toast",
  severity: "transient",
} satisfies SpectacleEvent;

describe("spectacle conductor", () => {
  test("dedupes delivered events and serializes headliners ahead of transient moments", () => {
    const state = createSpectacleConductorState(headlinerWin);
    const next = enqueueSpectacleEvents(state, [
      transientToast,
      headlinerRecord,
      headlinerRecord,
    ]);

    expect(next.active).toBe(headlinerWin);
    expect(next.queue.map((event) => event.id)).toEqual([
      "record-1",
      "toast-1",
    ]);
    expect(
      next.seenDedupeKeys.filter((key) => key === "record:single-week"),
    ).toHaveLength(1);

    const completed = completeSpectacleEvent(next);
    expect(completed.active?.id).toBe("record-1");
    expect(completed.queue.map((event) => event.id)).toEqual(["toast-1"]);
  });

  test("guards record stingers against unreviewed or provenance-free data", () => {
    expect(
      shouldFireRecordBrokenStinger({ previousRecordId: "old-record" }),
    ).toBe(true);
    expect(shouldFireRecordBrokenStinger({ previousRecordId: null })).toBe(
      false,
    );
    expect(
      shouldFireRecordBrokenStinger({
        needsReview: true,
        previousRecordId: "old-record",
      }),
    ).toBe(false);
  });
});

describe("spectacle primitives", () => {
  test("WireTicker exposes live marquee data and a reduced-motion static list", () => {
    render(
      <WireTicker
        items={[
          {
            fresh: true,
            id: "wire-1",
            kind: "record",
            label: "Single-week record fell",
            meta: "W9",
          },
          {
            id: "wire-2",
            kind: "bet",
            label: "Parlay settled",
            meta: "+900",
          },
        ]}
        motion="off"
        status="reconnecting"
        variant="arena"
      />,
    );

    const wire = screen.getByRole("region", { name: "League wire" });
    expect(wire.getAttribute("data-motion")).toBe("off");
    expect(wire.getAttribute("data-state")).toBe("reconnecting");
    expect(screen.getAllByText("reconnecting").length).toBeGreaterThan(0);

    const staticList = document.querySelector('[data-slot="wire-static-list"]');
    expect(staticList).toBeDefined();
    expect(
      within(staticList as HTMLElement).getByText("Parlay settled"),
    ).toBeDefined();
  });

  test("ScoreboardStrip renders live scores, stale notes, and a WP micro-gauge", () => {
    render(
      <ScoreboardStrip
        matchups={[
          {
            awayLabel: "Comets",
            awayScore: 91.4,
            homeLabel: "Founders",
            homeScore: 104.2,
            id: "matchup-1",
            previousAwayScore: 88.1,
            previousHomeScore: 99.6,
            status: "live",
            winProbability: 67,
          },
          {
            awayLabel: "Ghosts",
            awayScore: 75,
            homeLabel: "Orbits",
            homeScore: 77,
            id: "matchup-2",
            staleAsOf: "8:15 PM",
            status: "stale",
            winProbability: 44,
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("region", { name: "Live scoreboard" }),
    ).toBeDefined();
    expect(
      screen.getByRole("listitem", {
        name: /Comets 91.4 at Founders 104.2/i,
      }),
    ).toBeDefined();
    expect(
      screen
        .getByRole("progressbar", {
          name: "Founders win probability",
        })
        .getAttribute("aria-valuenow"),
    ).toBe("67");
    expect(screen.getByText("as of 8:15 PM")).toBeDefined();
  });

  test("CountUpValue animates changed numerics but snaps under motion off", () => {
    const { rerender } = render(
      <CountUpValue label="Bankroll" previousValue={10_000} value={11_250} />,
    );

    expect(
      screen.getByLabelText("Bankroll: 11250").getAttribute("data-animated"),
    ).toBe("true");

    rerender(
      <CountUpValue
        label="Bankroll"
        motion="off"
        previousValue={10_000}
        value={11_250}
      />,
    );

    expect(
      screen.getByLabelText("Bankroll: 11250").getAttribute("data-animated"),
    ).toBeNull();
  });

  test("CastOrbStatus keeps a textual status with a motion-off static orb", () => {
    render(<CastOrbStatus motion="off" state="writing" />);

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Cast is writing...");
    expect(status.getAttribute("data-motion")).toBe("off");
    expect(document.querySelector(".orb")?.getAttribute("data-state")).toBe(
      "think",
    );
  });

  test("SpectacleStinger disables spark burst when motion is off", () => {
    render(
      <SpectacleStinger
        detail="The arena top five changed hands."
        kind="big-win"
        metric="+18%"
        motion="off"
        title="A parlay hit hard enough to move the room"
      />,
    );

    const stinger = document.querySelector('[data-slot="spectacle-stinger"]');
    if (!stinger) throw new Error("expected spectacle stinger");
    expect(stinger.getAttribute("data-animated")).toBeNull();
    expect(screen.getByText("BIG WIN")).toBeDefined();
    expect(document.querySelector('[data-slot="stinger-sparks"]')).toBeNull();
  });

  test("VoteThresholdMeter and CanonizedMoment surface static threshold/canon states", () => {
    render(
      <>
        <VoteThresholdMeter
          count={8}
          label="Worst trade vote"
          motion="off"
          previousCount={7}
          threshold={8}
        />
        <CanonizedMoment
          claim="The 2019 panic trade is official league history."
          motion="off"
          tallyLabel="8 yes / 1 no"
        />
      </>,
    );

    expect(
      screen
        .getByRole("progressbar", {
          name: "Worst trade vote threshold progress",
        })
        .getAttribute("aria-valuetext"),
    ).toBe("8 of 8, threshold reached");
    expect(screen.getByText("Threshold reached.")).toBeDefined();
    expect(screen.getByText("CANON")).toBeDefined();
    expect(screen.getByText(/2019 panic trade/i)).toBeDefined();
  });
});
