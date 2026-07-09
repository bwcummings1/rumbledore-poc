import type { CanonCatalog, RecordsCatalog } from "@/stats";
import type { PersonalAgentLeagueQuestionContext } from "./personal-agent";

declare const canonCatalog: CanonCatalog;
declare const liveCatalog: RecordsCatalog;

const canonContext: PersonalAgentLeagueQuestionContext = {
  canonFacts: [],
  catalog: canonCatalog,
  leagueId: "league-canon",
  leagueName: "Canon League",
  lens: { grouping: null, segment: "both" },
};

const liveContext: PersonalAgentLeagueQuestionContext = {
  canonFacts: [],
  // @ts-expect-error live records catalogs must not satisfy the CanonCatalog brand
  catalog: liveCatalog,
  leagueId: "league-live",
  leagueName: "Live League",
  lens: { grouping: null, segment: "both" },
};

void canonContext;
void liveContext;
