import { appPing } from "./functions/app-ping";
import { contentGenerate } from "./functions/content-generate";
import {
  contentPlanPostOddsRefresh,
  contentPlanWeeklyPreview,
  contentPlanWeeklyWrap,
} from "./functions/content-plan-cron";
import { contentPlanGameFinal } from "./functions/content-plan-game-final";
import { importRequested } from "./functions/import-requested";
import { newsRefresh } from "./functions/news-refresh";

export { inngest } from "./client";
export { JOB_EVENTS } from "./events";
export { appPing } from "./functions/app-ping";
export { contentGenerate } from "./functions/content-generate";
export {
  contentPlanPostOddsRefresh,
  contentPlanWeeklyPreview,
  contentPlanWeeklyWrap,
} from "./functions/content-plan-cron";
export { contentPlanGameFinal } from "./functions/content-plan-game-final";
export { importRequested } from "./functions/import-requested";
export { newsRefresh } from "./functions/news-refresh";

export const functions = [
  appPing,
  importRequested,
  contentGenerate,
  contentPlanWeeklyPreview,
  contentPlanWeeklyWrap,
  contentPlanPostOddsRefresh,
  contentPlanGameFinal,
  newsRefresh,
] as const;
