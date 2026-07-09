import type { CanonCatalog, RecordsCatalog } from "@/stats";

/**
 * Test-only bridge for unit tests that fabricate personal-agent contexts.
 * Production code must obtain CanonCatalog through getLeagueCanonRecordsContext.
 */
export function forgeCanonCatalogForTest(
  catalog: RecordsCatalog,
): CanonCatalog {
  return catalog as CanonCatalog;
}
