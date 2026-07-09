import { appPing } from "./functions/app-ping";
import { bankrollRollover } from "./functions/bankroll-rollover";
import { bettingSettleGameFinal } from "./functions/betting-settle-game-final";
import { contentCorrectionNeeded } from "./functions/content-correction-needed";
import { contentGenerate } from "./functions/content-generate";
import {
  contentPlanMidWeek,
  contentPlanOffseasonBeat,
  contentPlanPostOddsRefresh,
  contentPlanWeeklyPreview,
  contentPlanWeeklyWrap,
} from "./functions/content-plan-cron";
import { contentPlanGameFinal } from "./functions/content-plan-game-final";
import { contentPlanLaunchEdition } from "./functions/content-plan-launch-edition";
import {
  contentPlanArenaStandingsSwing,
  contentPlanBetSettled,
  contentPlanLoreCanonized,
  contentPlanPollClosed,
  contentPlanRecordBroken,
  contentPlanTransaction,
  contentPlanWaiver,
} from "./functions/content-plan-trigger";
import { importRequested } from "./functions/import-requested";
import {
  ingestionTick,
  leagueIngest,
  seasonRolloverCheck,
} from "./functions/ingestion-live";
import { instigationSeed } from "./functions/instigation-seed";
import { loreVoteClose } from "./functions/lore-vote-close";
import { newsRefresh } from "./functions/news-refresh";
import { oddsPoll } from "./functions/odds-poll";
import { pollClose } from "./functions/poll-close";
import { weeklyDigest } from "./functions/weekly-digest";

export { inngest } from "./client";
export { JOB_EVENTS } from "./events";
export { appPing } from "./functions/app-ping";
export { bankrollRollover } from "./functions/bankroll-rollover";
export { bettingSettleGameFinal } from "./functions/betting-settle-game-final";
export { contentCorrectionNeeded } from "./functions/content-correction-needed";
export { contentGenerate } from "./functions/content-generate";
export {
  contentPlanMidWeek,
  contentPlanOffseasonBeat,
  contentPlanPostOddsRefresh,
  contentPlanWeeklyPreview,
  contentPlanWeeklyWrap,
} from "./functions/content-plan-cron";
export { contentPlanGameFinal } from "./functions/content-plan-game-final";
export { contentPlanLaunchEdition } from "./functions/content-plan-launch-edition";
export {
  contentPlanArenaStandingsSwing,
  contentPlanBetSettled,
  contentPlanLoreCanonized,
  contentPlanPollClosed,
  contentPlanRecordBroken,
  contentPlanTransaction,
  contentPlanWaiver,
} from "./functions/content-plan-trigger";
export { importRequested } from "./functions/import-requested";
export {
  ingestionTick,
  leagueIngest,
  seasonRolloverCheck,
} from "./functions/ingestion-live";
export { instigationSeed } from "./functions/instigation-seed";
export { loreVoteClose } from "./functions/lore-vote-close";
export { newsRefresh } from "./functions/news-refresh";
export { oddsPoll } from "./functions/odds-poll";
export { pollClose } from "./functions/poll-close";
export {
  createWeeklyDigestFunction,
  runWeeklyDigest,
  weeklyDigest,
} from "./functions/weekly-digest";

export const functions = [
  appPing,
  bankrollRollover,
  ingestionTick,
  leagueIngest,
  seasonRolloverCheck,
  importRequested,
  contentGenerate,
  contentCorrectionNeeded,
  contentPlanWeeklyPreview,
  contentPlanWeeklyWrap,
  contentPlanMidWeek,
  contentPlanPostOddsRefresh,
  contentPlanOffseasonBeat,
  contentPlanGameFinal,
  contentPlanLaunchEdition,
  contentPlanTransaction,
  contentPlanWaiver,
  contentPlanRecordBroken,
  contentPlanLoreCanonized,
  contentPlanPollClosed,
  contentPlanBetSettled,
  contentPlanArenaStandingsSwing,
  instigationSeed,
  pollClose,
  loreVoteClose,
  bettingSettleGameFinal,
  newsRefresh,
  oddsPoll,
  weeklyDigest,
] as const;
