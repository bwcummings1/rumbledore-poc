import { describe, expect, it, vi } from "vitest";
import {
  type CentralFreshnessSourceAdapter,
  type CentralFreshnessSourceAdapters,
  createCentralDataFreshnessService,
} from "./central-freshness";

const now = new Date("2026-09-15T14:00:00.000Z");
const refreshedObservation = new Date("2026-09-15T13:59:00.000Z");

function adapter(
  observedAt: Date | null,
  evidenceAt = observedAt,
): CentralFreshnessSourceAdapter & {
  refresh: ReturnType<typeof vi.fn>;
} {
  return {
    inspect: vi
      .fn()
      .mockResolvedValueOnce({ evidenceAt, observedAt })
      .mockResolvedValue({
        evidenceAt: refreshedObservation,
        observedAt: refreshedObservation,
      }),
    refresh: vi.fn().mockResolvedValue(undefined),
  };
}

function adapters(): CentralFreshnessSourceAdapters {
  return {
    "betting-odds": adapter(new Date("2026-09-15T13:58:00.000Z")),
    "central-news": adapter(new Date("2026-09-15T13:55:00.000Z")),
    "general-stats": adapter(new Date("2026-09-15T10:00:00.000Z")),
  };
}

describe("central data freshness", () => {
  it("refreshes only stale declared sources before generation", async () => {
    const sources = adapters();
    const result = await createCentralDataFreshnessService({
      adapters: sources,
    }).ensureFresh({
      dataSources: ["general-stats", "central-news", "general-stats"],
      now,
      season: 2026,
      week: 1,
    });

    expect(sources["general-stats"].refresh).toHaveBeenCalledOnce();
    expect(sources["central-news"].refresh).not.toHaveBeenCalled();
    expect(sources["betting-odds"].inspect).not.toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        dataSource: "general-stats",
        observedAt: refreshedObservation.toISOString(),
        refreshedAt: now.toISOString(),
        status: "refreshed",
      }),
      expect.objectContaining({
        dataSource: "central-news",
        observedAt: "2026-09-15T13:55:00.000Z",
        refreshedAt: null,
        status: "fresh",
      }),
    ]);
  });

  it("does not publish past a failed required refresh", async () => {
    const sources = adapters();
    vi.mocked(sources["general-stats"].refresh).mockRejectedValueOnce(
      new Error("fixture refresh failed"),
    );
    const service = createCentralDataFreshnessService({ adapters: sources });

    await expect(
      service.ensureFresh({
        dataSources: ["general-stats"],
        now,
        season: 2026,
        week: 1,
      }),
    ).rejects.toThrow("fixture refresh failed");
  });

  it.each([
    {
      evidenceAt: new Date("2026-09-15T10:00:00.000Z"),
      label: "unchanged",
      observedAt: new Date("2026-09-15T10:00:00.000Z"),
    },
    { evidenceAt: null, label: "empty", observedAt: null },
  ])(
    "rejects a successful refresh when the inspected source remains $label",
    async ({ evidenceAt, observedAt }) => {
      const sources = adapters();
      vi.mocked(sources["general-stats"].inspect).mockReset();
      vi.mocked(sources["general-stats"].inspect).mockResolvedValue({
        evidenceAt,
        observedAt,
      });

      await expect(
        createCentralDataFreshnessService({ adapters: sources }).ensureFresh({
          dataSources: ["general-stats"],
          now,
          season: 2026,
          week: 1,
        }),
      ).rejects.toMatchObject({
        code: "CENTRAL_AI_FRESHNESS_NOT_ADVANCED",
        details: { dataSource: "general-stats" },
      });
      expect(sources["general-stats"].refresh).toHaveBeenCalledOnce();
      expect(sources["general-stats"].inspect).toHaveBeenCalledTimes(2);
    },
  );
});
