// @vitest-environment node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { AI_CONTENT_TYPES } from "@/ai";
import { EVAL_LEAGUE_FIXTURES } from "./fixtures";
import {
  defaultAiVariantEvalVariants,
  runAiVariantEval,
} from "./variant-harness";

const REPORT_PATH = join(
  process.cwd(),
  "test-results",
  "ai-variants",
  "scorecard.json",
);

describe("AI variant eval harness", () => {
  it("scores model and tone variants, writes a scorecard, and names a winner", async () => {
    const report = await runAiVariantEval({
      variants: defaultAiVariantEvalVariants(),
    });

    const control = report.variants.find(
      (variant) => variant.label === "tone-v1-control",
    );
    const challenger = report.variants.find(
      (variant) => variant.label === "tone-v2-sharper",
    );
    const leaking = report.variants.find(
      (variant) => variant.label === "leak-control",
    );

    expect(report.samples).toHaveLength(
      EVAL_LEAGUE_FIXTURES.length *
        AI_CONTENT_TYPES.length *
        report.variants.length,
    );
    expect(report.winner?.label).toBe("tone-v2-sharper");
    expect(control?.disqualified).toBe(false);
    expect(challenger?.disqualified).toBe(false);
    expect(leaking?.disqualified).toBe(true);
    expect(leaking?.disqualificationReasons.join(" ")).toContain("leakage");
    expect(challenger?.meanMatchedPersonaMarkers).toBeGreaterThan(
      control?.meanMatchedPersonaMarkers ?? 0,
    );

    const firstControlSample = report.samples.find(
      (sample) =>
        sample.variantLabel === "tone-v1-control" &&
        sample.fixtureLeagueId === EVAL_LEAGUE_FIXTURES[0].leagueId &&
        sample.contentType === AI_CONTENT_TYPES[0],
    );
    const firstChallengerSample = report.samples.find(
      (sample) =>
        sample.variantLabel === "tone-v2-sharper" &&
        sample.fixtureLeagueId === EVAL_LEAGUE_FIXTURES[0].leagueId &&
        sample.contentType === AI_CONTENT_TYPES[0],
    );
    expect(firstControlSample?.draftHash).not.toBe(
      firstChallengerSample?.draftHash,
    );

    await mkdir(dirname(REPORT_PATH), { recursive: true });
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${report.summary}\n`);
    process.stdout.write(`AI variant scorecard: ${REPORT_PATH}\n`);
  });
});
