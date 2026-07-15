import { describe, expect, it } from "vitest";
import { centralPublicationSectionById } from "@/news/sections";
import {
  CENTRAL_COLUMN_KEYS,
  CENTRAL_COLUMN_LINEUP,
  CENTRAL_JOURNALIST_KEYS,
  CENTRAL_JOURNALISTS,
  centralColumnCronSchedules,
  centralColumnForId,
  centralColumnsForQueue,
  centralColumnsScheduledAt,
  centralJournalistForId,
} from "./central-columns";

function scheduledIdsAt(value: string): string[] {
  return centralColumnsScheduledAt(new Date(value)).map((column) => column.id);
}

describe("central journalist engine config", () => {
  it("keeps the locked News and Fantasy lineup in one config", () => {
    expect(CENTRAL_COLUMN_KEYS).toHaveLength(10);
    expect(
      CENTRAL_COLUMN_KEYS.map((key) => {
        const column = CENTRAL_COLUMN_LINEUP[key];
        return {
          branch: column.branch,
          contentType: column.contentType,
          id: column.id,
          section: column.section,
        };
      }),
    ).toEqual([
      {
        branch: "news",
        contentType: "central_wire_blurb",
        id: "the-wire",
        section: "wire",
      },
      {
        branch: "news",
        contentType: "central_rundown_report",
        id: "the-rundown",
        section: "rundown",
      },
      {
        branch: "fantasy",
        contentType: "central_weekend_recap_mnf_projection",
        id: "weekend-recap-mnf-projection",
        section: "weekend-recap-mnf-projection",
      },
      {
        branch: "fantasy",
        contentType: "central_mnf_recap",
        id: "mnf-recap",
        section: "mnf-recap",
      },
      {
        branch: "fantasy",
        contentType: "central_pre_waiver",
        id: "pre-waiver",
        section: "pre-waiver",
      },
      {
        branch: "fantasy",
        contentType: "central_post_waiver",
        id: "post-waiver",
        section: "post-waiver",
      },
      {
        branch: "fantasy",
        contentType: "central_matchups",
        id: "matchups",
        section: "matchups",
      },
      {
        branch: "fantasy",
        contentType: "central_rankings_projections",
        id: "rankings-projections",
        section: "rankings-projections",
      },
      {
        branch: "fantasy",
        contentType: "central_start_sit",
        id: "start-sit",
        section: "start-sit",
      },
      {
        branch: "fantasy",
        contentType: "central_injuries",
        id: "injuries",
        section: "injuries",
      },
    ]);

    for (const key of CENTRAL_COLUMN_KEYS) {
      const column = CENTRAL_COLUMN_LINEUP[key];
      expect(centralPublicationSectionById(column.section).branch).toBe(
        column.branch,
      );
      expect(column.dataSources.length).toBeGreaterThan(0);
      expect(column.formatContract.length).toBeGreaterThan(0);
      expect(centralJournalistForId(column.journalistId)).not.toBeNull();
    }
    expect(centralColumnForId("the-wire")?.name).toBe("The Wire");
    expect(centralColumnForId("not-a-column")).toBeNull();
  });

  it("assigns configurable central journalists backed by known personas", () => {
    expect(CENTRAL_JOURNALIST_KEYS).toHaveLength(5);
    for (const key of CENTRAL_JOURNALIST_KEYS) {
      const journalist = CENTRAL_JOURNALISTS[key];
      expect(journalist.name).not.toBe("");
      expect(journalist.beat).not.toBe("");
      expect(journalist.registerContract).not.toBe("");
      expect(centralJournalistForId(journalist.id)).toBe(journalist);
    }
    expect(centralJournalistForId("not-a-journalist")).toBeNull();
  });

  it("derives the corrected fantasy cadence from configured UTC slots", () => {
    expect(scheduledIdsAt("2026-10-12T14:00:00.000Z")).toEqual([
      "weekend-recap-mnf-projection",
    ]);
    expect(scheduledIdsAt("2026-10-13T14:00:00.000Z")).toEqual([
      "mnf-recap",
      "pre-waiver",
      "rankings-projections",
    ]);
    expect(scheduledIdsAt("2026-10-14T11:00:00.000Z")).toEqual(["post-waiver"]);
    expect(scheduledIdsAt("2026-10-14T14:00:00.000Z")).toEqual([
      "matchups",
      "rankings-projections",
    ]);
    expect(scheduledIdsAt("2026-10-15T14:00:00.000Z")).toEqual([
      "matchups",
      "start-sit",
    ]);
    expect(scheduledIdsAt("2026-10-16T14:00:00.000Z")).toEqual(["start-sit"]);
    expect(scheduledIdsAt("2026-10-17T14:00:00.000Z")).toEqual(["start-sit"]);
    expect(scheduledIdsAt("2026-10-18T14:00:00.000Z")).toEqual(["start-sit"]);
    expect(scheduledIdsAt("2026-10-14T12:00:00.000Z")).toEqual([]);
    expect(centralColumnCronSchedules()).toEqual([
      "0 11 * * 3",
      "0 14 * * 0,1,2,3,4,5,6",
    ]);
  });

  it("keeps reactive and configurable-report work on explicit queues", () => {
    expect(
      centralColumnsForQueue("central-news-events").map((column) => column.id),
    ).toEqual(["the-wire"]);
    expect(
      centralColumnsForQueue("central-report-requests").map(
        (column) => column.id,
      ),
    ).toEqual(["the-rundown"]);
    expect(
      centralColumnsForQueue("central-injury-events").map(
        (column) => column.id,
      ),
    ).toEqual(["injuries"]);
  });
});
