import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveNavigationState } from "./scope";
import { useActiveNavigationState } from "./use-active-navigation-state";

const pathnameMock = vi.hoisted(() => ({
  current: "/leagues/league-a/records",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock.current,
}));

beforeEach(() => {
  pathnameMock.current = "/leagues/league-a/records";
});

afterEach(() => {
  cleanup();
});

describe("useActiveNavigationState", () => {
  it("keeps one active-state identity while the pathname holds still", () => {
    const { forceRender, states } = renderProbe();

    act(() => {
      forceRender();
    });
    act(() => {
      forceRender();
    });

    expect(states.length).toBe(3);
    expect(states[0]).toEqual({
      leagueId: "league-a",
      pathname: "/leagues/league-a/records",
      scope: "league",
      sectionId: "records",
    });
    // Referential, not structural: `activeState` is the dependency of the
    // shell's command-item/notification/wire memos and of the realtime
    // subscription effect, so a fresh object per render defeats all of them.
    expect(states[1]).toBe(states[0]);
    expect(states[2]).toBe(states[0]);
  });

  it("re-derives when the pathname actually changes", () => {
    const { forceRender, states } = renderProbe();

    pathnameMock.current = "/news/rundown";
    act(() => {
      forceRender();
    });

    expect(states[1]).not.toBe(states[0]);
    expect(states[1]).toEqual({
      leagueId: null,
      pathname: "/news/rundown",
      scope: "news",
      sectionId: "rundown",
    });
  });
});

function renderProbe() {
  const states: ActiveNavigationState[] = [];
  let forceRender: () => void = () => {
    throw new Error("probe not mounted");
  };

  function Probe() {
    const [, setTick] = useState(0);
    forceRender = () => setTick((tick) => tick + 1);
    states.push(useActiveNavigationState());
    return null;
  }

  render(<Probe />);

  return { forceRender, states };
}
