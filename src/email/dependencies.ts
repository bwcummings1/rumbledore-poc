import type { Env } from "@/core/env/schema";
import type { Db } from "@/db/client";
import { MockEmailSender, type WeeklyDigestDependencies } from "./digest";

export function createWeeklyDigestDependencies(
  db: Db,
  env: Pick<Env, "auth">,
): WeeklyDigestDependencies {
  return {
    appUrl: env.auth.url,
    db,
    emailSender: new MockEmailSender(),
  };
}
