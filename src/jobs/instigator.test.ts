// @vitest-environment node
import { randomUUID } from "node:crypto";
import { NonRetriableError } from "inngest";
import { describe, expect, it } from "vitest";
import { JOB_EVENTS } from "./events";
import {
  instigationSeed,
  runInstigationSeed,
} from "./functions/instigation-seed";
import { loreVoteClose, runLoreVoteClose } from "./functions/lore-vote-close";
import { pollClose, runPollClose } from "./functions/poll-close";
import { functions } from "./index";

describe("instigator job functions", () => {
  it("rejects invalid instigation seed payloads without retrying", async () => {
    await expect(
      runInstigationSeed({
        data: {
          dedupKey: "missing-grounding",
          kind: "settle_it_poll",
          leagueId: randomUUID(),
          options: ["A", "B"],
          persona: "trash_talker",
          promptText: "Settle it?",
        },
        deps: {} as never,
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);
  });

  it("rejects invalid poll close payloads without retrying", async () => {
    await expect(
      runPollClose({
        data: {
          leagueId: randomUUID(),
          pollId: "not-a-uuid",
        },
        deps: {} as never,
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);
  });

  it("rejects invalid lore vote close payloads without retrying", async () => {
    await expect(
      runLoreVoteClose({
        data: {
          claimId: "not-a-uuid",
          leagueId: randomUUID(),
        },
        deps: {} as never,
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);
  });

  it("exports the producer events and functions", () => {
    expect(JOB_EVENTS.instigationSeed).toBe("instigation.seed");
    expect(JOB_EVENTS.instigationSeeded).toBe("instigation.seeded");
    expect(JOB_EVENTS.pollClose).toBe("poll.close");
    expect(JOB_EVENTS.loreVoteClose).toBe("lore.vote.close");
    expect(functions).toContain(instigationSeed);
    expect(functions).toContain(pollClose);
    expect(functions).toContain(loreVoteClose);
  });
});
