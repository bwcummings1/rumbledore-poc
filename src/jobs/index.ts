import { appPing } from "./functions/app-ping";
import { contentGenerate } from "./functions/content-generate";
import { importRequested } from "./functions/import-requested";
import { newsRefresh } from "./functions/news-refresh";

export { inngest } from "./client";
export { JOB_EVENTS } from "./events";
export { appPing } from "./functions/app-ping";
export { contentGenerate } from "./functions/content-generate";
export { importRequested } from "./functions/import-requested";
export { newsRefresh } from "./functions/news-refresh";

export const functions = [
  appPing,
  importRequested,
  contentGenerate,
  newsRefresh,
] as const;
