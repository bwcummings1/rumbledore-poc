import { appPing } from "./functions/app-ping";
import { bettingSettleGameFinal } from "./functions/betting-settle-game-final";
import { contentGenerate } from "./functions/content-generate";
import {
  contentPlanMidWeek,
  contentPlanPostOddsRefresh,
  contentPlanWeeklyPreview,
  contentPlanWeeklyWrap,
} from "./functions/content-plan-cron";
import { contentPlanGameFinal } from "./functions/content-plan-game-final";
import {
  contentPlanBetSettled,
  contentPlanLoreCanonized,
  contentPlanPollClosed,
  contentPlanRecordBroken,
  contentPlanTransaction,
  contentPlanWaiver,
} from "./functions/content-plan-trigger";
import { importRequested } from "./functions/import-requested";
import { newsRefresh } from "./functions/news-refresh";
import { oddsPoll } from "./functions/odds-poll";

export { inngest } from "./client";
export { JOB_EVENTS } from "./events";
export { appPing } from "./functions/app-ping";
export { bettingSettleGameFinal } from "./functions/betting-settle-game-final";
export { contentGenerate } from "./functions/content-generate";
export {
  contentPlanMidWeek,
  contentPlanPostOddsRefresh,
  contentPlanWeeklyPreview,
  contentPlanWeeklyWrap,
} from "./functions/content-plan-cron";
export { contentPlanGameFinal } from "./functions/content-plan-game-final";
export {
  contentPlanBetSettled,
  contentPlanLoreCanonized,
  contentPlanPollClosed,
  contentPlanRecordBroken,
  contentPlanTransaction,
  contentPlanWaiver,
} from "./functions/content-plan-trigger";
export { importRequested } from "./functions/import-requested";
export { newsRefresh } from "./functions/news-refresh";
export { oddsPoll } from "./functions/odds-poll";

export const functions = [
  appPing,
  importRequested,
  contentGenerate,
  contentPlanWeeklyPreview,
  contentPlanWeeklyWrap,
  contentPlanMidWeek,
  contentPlanPostOddsRefresh,
  contentPlanGameFinal,
  contentPlanTransaction,
  contentPlanWaiver,
  contentPlanRecordBroken,
  contentPlanLoreCanonized,
  contentPlanPollClosed,
  contentPlanBetSettled,
  bettingSettleGameFinal,
  newsRefresh,
  oddsPoll,
] as const;
