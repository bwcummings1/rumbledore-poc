import { createHash } from "node:crypto";
import {
  AI_CONTENT_TYPES,
  type AiContentType,
  type AiPersona,
  type BlogDraft,
  CONTENT_TYPE_TEMPLATES,
  DEFAULT_LLM_JUDGE_RUBRIC,
  DEFAULT_PERSONA_CARDS,
  type LeagueBlogContext,
  type LlmClient,
  type LlmJudge,
  type LlmJudgeRubric,
  type LlmJudgeScore,
  MockLlmClient,
  MockLlmJudge,
} from "@/ai";
import { blogDraftText } from "@/ai/article-draft";
import type { ToneProfile } from "@/ai/personas";
import {
  DEFAULT_LEAGUE_BLOG_PROMPT_TEMPLATE,
  type PromptTemplate,
} from "@/ai/prompt-templates";
import {
  contextFor,
  EVAL_LEAGUE_FIXTURES,
  type EvalLeagueFixture,
  evalPersonaCard,
  fixtureTokens,
  generateEvalDraft,
} from "./fixtures";

export interface AiVariantEvalVariant {
  label: string;
  modelProviderKey: string;
  toneVersion: number;
  promptTemplate?: PromptTemplate;
  toneProfileForPersona?: (
    persona: AiPersona,
    baseProfile: ToneProfile,
  ) => ToneProfile;
  createLlm?: (input: CreateVariantLlmInput) => LlmClient;
}

export interface CreateVariantLlmInput {
  variant: AiVariantEvalVariant;
  fixture: EvalLeagueFixture;
  otherFixture: EvalLeagueFixture | null;
  contentType: AiContentType;
  persona: AiPersona;
  context: LeagueBlogContext;
}

export interface AiVariantEvalSample {
  variantLabel: string;
  fixtureLeagueId: string;
  fixtureLeagueName: string;
  contentType: AiContentType;
  persona: AiPersona;
  modelProviderKey: string;
  toneVersion: number;
  promptTemplateId: string;
  promptTemplateVersion: number;
  draftHash: string;
  score: LlmJudgeScore;
}

export interface AiVariantResult {
  label: string;
  modelProviderKey: string;
  toneVersion: number;
  promptTemplateId: string;
  promptTemplateVersion: number;
  samples: number;
  meanAuthenticity: number;
  meanPersonaMatch: number;
  meanMatchedLeagueFacts: number;
  meanMatchedPersonaMarkers: number;
  leakageCount: number;
  disqualified: boolean;
  disqualificationReasons: string[];
  deltaFromWinner: {
    authenticity: number;
    personaMatch: number;
    matchedPersonaMarkers: number;
  } | null;
}

export interface AiVariantScorecard {
  generatedAt: string;
  rule: string;
  rubric: LlmJudgeRubric;
  matrix: {
    fixtureLeagueIds: string[];
    contentTypes: AiContentType[];
  };
  variants: AiVariantResult[];
  samples: AiVariantEvalSample[];
  winner: {
    label: string;
    reason: string;
  } | null;
  summary: string;
}

export interface RunAiVariantEvalInput {
  contentTypes?: readonly AiContentType[];
  fixtures?: readonly EvalLeagueFixture[];
  generatedAt?: string;
  judge?: LlmJudge;
  rubric?: LlmJudgeRubric;
  variants: readonly AiVariantEvalVariant[];
}

const VARIANT_WIN_RULE =
  "Disqualify any variant with leakage, mean authenticity below threshold, or mean persona match below threshold; rank remaining variants by mean authenticity, then mean persona match, then matched persona markers per sample.";

function copyProfile(profile: ToneProfile): ToneProfile {
  return {
    beats: [...profile.beats],
    diction: [...profile.diction],
    dosAndDonts: [...profile.dosAndDonts],
    guardrails: {
      loreCanonContract: [...profile.guardrails.loreCanonContract],
      noLeakage: [...profile.guardrails.noLeakage],
      noRealMoney: [...profile.guardrails.noRealMoney],
      untrustedNews: [...profile.guardrails.untrustedNews],
    },
    pointOfView: profile.pointOfView,
    styleDirectives: [...profile.styleDirectives],
  };
}

function toneV2Profile(persona: AiPersona, baseProfile: ToneProfile) {
  const profile = copyProfile(baseProfile);
  const personaLabel = persona.replaceAll("_", " ");
  return {
    ...profile,
    beats: [
      ...profile.beats,
      `${personaLabel} v2 variant beat`,
      `${personaLabel} exact-room consequence`,
    ],
    diction: [
      ...profile.diction,
      `${personaLabel} receipts`,
      `${personaLabel} room ledger`,
    ],
    dosAndDonts: [
      ...profile.dosAndDonts,
      `Do make the ${personaLabel} v2 angle auditable to the fixture.`,
    ],
    styleDirectives: [
      ...profile.styleDirectives,
      `${personaLabel} v2 names the consequence before the joke`,
      `${personaLabel} v2 ties every flourish to a supplied token`,
    ],
  } satisfies ToneProfile;
}

function promptTemplateForVariant(variant: AiVariantEvalVariant) {
  return variant.promptTemplate ?? DEFAULT_LEAGUE_BLOG_PROMPT_TEMPLATE;
}

function toneProfileForVariant(
  persona: AiPersona,
  variant: AiVariantEvalVariant,
) {
  const baseProfile = DEFAULT_PERSONA_CARDS[persona].toneProfile;
  return variant.toneProfileForPersona?.(persona, baseProfile) ?? baseProfile;
}

function otherFixtureFor(
  fixture: EvalLeagueFixture,
  fixtures: readonly EvalLeagueFixture[],
): EvalLeagueFixture | null {
  return (
    fixtures.find((candidate) => candidate.leagueId !== fixture.leagueId) ??
    null
  );
}

function mean(values: readonly number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function draftHash(draft: BlogDraft) {
  return createHash("sha256").update(blogDraftText(draft)).digest("hex");
}

function compareVariantResult(left: AiVariantResult, right: AiVariantResult) {
  return (
    right.meanAuthenticity - left.meanAuthenticity ||
    right.meanPersonaMatch - left.meanPersonaMatch ||
    right.meanMatchedPersonaMarkers - left.meanMatchedPersonaMarkers ||
    left.label.localeCompare(right.label)
  );
}

function resultForVariant({
  rubric,
  samples,
  variant,
}: {
  rubric: LlmJudgeRubric;
  samples: readonly AiVariantEvalSample[];
  variant: AiVariantEvalVariant;
}): AiVariantResult {
  const variantSamples = samples.filter(
    (sample) => sample.variantLabel === variant.label,
  );
  const leakageCount = variantSamples.filter(
    (sample) => sample.score.leakage,
  ).length;
  const meanAuthenticity = mean(
    variantSamples.map((sample) => sample.score.authenticity),
  );
  const meanPersonaMatch = mean(
    variantSamples.map((sample) => sample.score.personaMatch),
  );
  const meanMatchedLeagueFacts = mean(
    variantSamples.map((sample) => sample.score.matchedLeagueFacts.length),
  );
  const meanMatchedPersonaMarkers = mean(
    variantSamples.map((sample) => sample.score.matchedPersonaMarkers.length),
  );
  const disqualificationReasons = [
    leakageCount > 0 ? `leakage in ${leakageCount} sample(s)` : null,
    meanAuthenticity < rubric.authenticityThreshold
      ? `mean authenticity ${meanAuthenticity.toFixed(3)} below ${rubric.authenticityThreshold}`
      : null,
    meanPersonaMatch < rubric.personaMatchThreshold
      ? `mean persona match ${meanPersonaMatch.toFixed(3)} below ${rubric.personaMatchThreshold}`
      : null,
  ].filter((reason): reason is string => reason !== null);
  const template = promptTemplateForVariant(variant);

  return {
    deltaFromWinner: null,
    disqualificationReasons,
    disqualified: disqualificationReasons.length > 0,
    label: variant.label,
    leakageCount,
    meanAuthenticity,
    meanMatchedLeagueFacts,
    meanMatchedPersonaMarkers,
    meanPersonaMatch,
    modelProviderKey: variant.modelProviderKey,
    promptTemplateId: template.id,
    promptTemplateVersion: template.version,
    samples: variantSamples.length,
    toneVersion: variant.toneVersion,
  };
}

function withWinnerDeltas(
  results: readonly AiVariantResult[],
  winner: AiVariantResult | null,
): AiVariantResult[] {
  return results.map((result) => ({
    ...result,
    deltaFromWinner: winner
      ? {
          authenticity: result.meanAuthenticity - winner.meanAuthenticity,
          matchedPersonaMarkers:
            result.meanMatchedPersonaMarkers - winner.meanMatchedPersonaMarkers,
          personaMatch: result.meanPersonaMatch - winner.meanPersonaMatch,
        }
      : null,
  }));
}

function scorecardSummary({
  results,
  winner,
}: {
  results: readonly AiVariantResult[];
  winner: AiVariantResult | null;
}) {
  if (!winner) {
    return "AI variant eval winner: none; every variant was disqualified.";
  }
  const disqualified = results.filter((result) => result.disqualified).length;
  return [
    `AI variant eval winner: ${winner.label}`,
    `authenticity ${winner.meanAuthenticity.toFixed(3)}`,
    `persona ${winner.meanPersonaMatch.toFixed(3)}`,
    `leakage ${winner.leakageCount}/${winner.samples}`,
    `disqualified ${disqualified}`,
  ].join(" | ");
}

export async function runAiVariantEval({
  contentTypes = AI_CONTENT_TYPES,
  fixtures = EVAL_LEAGUE_FIXTURES,
  generatedAt = "2026-06-16T00:00:00.000Z",
  judge = new MockLlmJudge(),
  rubric = DEFAULT_LLM_JUDGE_RUBRIC,
  variants,
}: RunAiVariantEvalInput): Promise<AiVariantScorecard> {
  const samples: AiVariantEvalSample[] = [];

  for (const variant of variants) {
    const template = promptTemplateForVariant(variant);
    for (const fixture of fixtures) {
      const otherFixture = otherFixtureFor(fixture, fixtures);
      for (const contentType of contentTypes) {
        const persona = CONTENT_TYPE_TEMPLATES[contentType].defaultPersonas[0];
        if (!persona) {
          throw new Error(`${contentType} has no default persona`);
        }

        const context = contextFor({
          fixture,
          persona,
          personaCard: evalPersonaCard({
            overrides: {
              toneProfile: toneProfileForVariant(persona, variant),
              toneUpdatedAt: new Date("2026-06-16T00:00:00.000Z"),
              toneUpdatedBy: "eval:ai:variants",
              toneVersion: variant.toneVersion,
            },
            persona,
          }),
        });
        const llm =
          variant.createLlm?.({
            contentType,
            context,
            fixture,
            otherFixture,
            persona,
            variant,
          }) ?? new MockLlmClient();
        const draft = await generateEvalDraft({
          contentType,
          context,
          llm,
          template,
        });
        const score = await judge.score({
          leagueFacts: {
            context,
            otherLeagueEntityTokens: otherFixture
              ? fixtureTokens(otherFixture)
              : [],
          },
          piece: draft,
          rubric,
        });

        samples.push({
          contentType,
          draftHash: draftHash(draft),
          fixtureLeagueId: fixture.leagueId,
          fixtureLeagueName: fixture.leagueName,
          modelProviderKey: variant.modelProviderKey,
          persona,
          promptTemplateId: template.id,
          promptTemplateVersion: template.version,
          score,
          toneVersion: variant.toneVersion,
          variantLabel: variant.label,
        });
      }
    }
  }

  const rawResults = variants.map((variant) =>
    resultForVariant({ rubric, samples, variant }),
  );
  const winner =
    [...rawResults]
      .filter((result) => !result.disqualified)
      .sort(compareVariantResult)[0] ?? null;
  const results = withWinnerDeltas(rawResults, winner);

  return {
    generatedAt,
    matrix: {
      contentTypes: [...contentTypes],
      fixtureLeagueIds: fixtures.map((fixture) => fixture.leagueId),
    },
    rubric,
    rule: VARIANT_WIN_RULE,
    samples,
    summary: scorecardSummary({ results, winner }),
    variants: results,
    winner: winner
      ? {
          label: winner.label,
          reason: VARIANT_WIN_RULE,
        }
      : null,
  };
}

class LeakingMockLlmClient implements LlmClient {
  private readonly inner = new MockLlmClient();

  constructor(private readonly leakedToken: string) {}

  async generate(request: Parameters<LlmClient["generate"]>[0]) {
    const draft = await this.inner.generate(request);
    const leakedText = `Leak control should be disqualified: ${this.leakedToken}`;
    return {
      ...draft,
      body: `${draft.body}\n\n${leakedText}`,
      bodyBlocks: [
        ...draft.bodyBlocks,
        { text: leakedText, type: "paragraph" as const },
      ],
      dek: `${draft.dek} ${this.leakedToken}`,
      summary: `${draft.summary} ${this.leakedToken}`,
    };
  }
}

export function defaultAiVariantEvalVariants(): AiVariantEvalVariant[] {
  return [
    {
      label: "tone-v1-control",
      modelProviderKey: "mock-bulk",
      toneVersion: 1,
    },
    {
      label: "tone-v2-sharper",
      modelProviderKey: "mock-custom",
      toneProfileForPersona: toneV2Profile,
      toneVersion: 2,
    },
    {
      createLlm: ({ otherFixture }) =>
        new LeakingMockLlmClient(
          otherFixture ? fixtureTokens(otherFixture)[0] : "leak-control",
        ),
      label: "leak-control",
      modelProviderKey: "mock-leaky",
      toneProfileForPersona: toneV2Profile,
      toneVersion: 2,
    },
  ];
}
