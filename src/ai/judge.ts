import { AppError } from "@/core/result";
import type { LlmJudgeRubric, LlmJudgeScore } from "./interfaces";

export const DEFAULT_LLM_JUDGE_RUBRIC: LlmJudgeRubric = {
  authenticityThreshold: 0.7,
  personaMatchThreshold: 0.7,
  targetingConsentRequired: true,
};

export function llmJudgeScorePasses(
  score: LlmJudgeScore,
  rubric: LlmJudgeRubric = DEFAULT_LLM_JUDGE_RUBRIC,
): boolean {
  return (
    score.authenticity >= rubric.authenticityThreshold &&
    score.personaMatch >= rubric.personaMatchThreshold &&
    !score.leakage &&
    (!rubric.targetingConsentRequired || score.targetingConsent)
  );
}

export function assertLlmJudgeScorePasses({
  label,
  rubric = DEFAULT_LLM_JUDGE_RUBRIC,
  score,
}: {
  label: string;
  rubric?: LlmJudgeRubric;
  score: LlmJudgeScore;
}): void {
  if (llmJudgeScorePasses(score, rubric)) {
    return;
  }

  throw new AppError({
    code: "AI_JUDGE_EVAL_FAILED",
    details: {
      authenticity: score.authenticity,
      authenticityThreshold: rubric.authenticityThreshold,
      leakedTokens: score.leakedTokens,
      leakage: score.leakage,
      matchedLeagueFacts: score.matchedLeagueFacts,
      matchedPersonaMarkers: score.matchedPersonaMarkers,
      notes: score.notes,
      personaMatch: score.personaMatch,
      personaMatchThreshold: rubric.personaMatchThreshold,
      targetedOffLimits: score.targetedOffLimits,
      targetingConsent: score.targetingConsent,
    },
    message: `${label} failed the AI judge eval gate`,
    status: 422,
  });
}
