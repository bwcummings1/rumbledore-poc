import type { EmbeddingProvider, EmbeddingResult } from "./interfaces";

/**
 * Rough token count for text whose provider did not report usage. Deliberately
 * crude (~4 characters per token) — it exists so an unreported call is metered
 * as approximately-something rather than silently as zero, which is the failure
 * mode that made the cost meter read low in the first place. Rows built from it
 * carry `estimated: true`.
 */
export function estimateTokenCount(text: string): number {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact ? Math.max(1, Math.ceil(compact.length / 4)) : 0;
}

/**
 * Embed text and report what it cost. `EmbeddingProvider.embed` returns only a
 * vector, so this probes for the widened `embedWithUsage` contract and falls
 * back to estimating from the input text — the same optional-capability shape
 * `pipeline.ts` uses for `generateWithUsage`. Keeping the fallback here means
 * the many small `EmbeddingProvider` test doubles stay valid unchanged.
 *
 * Embeddings are input-only, so `outputTokens` and both cache fields are always
 * zero; `estimateCostMicrosUsd` then prices the row off `inputTokens` alone.
 */
export async function embedWithUsage(
  provider: EmbeddingProvider,
  text: string,
): Promise<EmbeddingResult> {
  const usageProvider = provider as Partial<{
    embedWithUsage(text: string): Promise<EmbeddingResult>;
  }>;
  if (usageProvider.embedWithUsage) {
    return usageProvider.embedWithUsage(text);
  }

  return {
    embedding: await provider.embed(text),
    estimated: true,
    model: provider.model,
    usage: {
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      inputTokens: estimateTokenCount(text),
      outputTokens: 0,
    },
  };
}
