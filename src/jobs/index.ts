import { appPing } from "./functions/app-ping";

export { inngest } from "./client";
export { JOB_EVENTS } from "./events";
export { appPing } from "./functions/app-ping";

export const functions = [appPing] as const;
