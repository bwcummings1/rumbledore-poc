import type { Env } from "@/core/env/schema";
import type { Db } from "@/db/client";
import type { PushNotifier } from "./interfaces";
import { NoopPushNotifier } from "./mocks";
import { WebPushNotifier } from "./notifier";

export function createPushNotifier(
  db: Db,
  env: Pick<Env, "push">,
): PushNotifier {
  return env.push.mock
    ? new NoopPushNotifier()
    : new WebPushNotifier({
        db,
        privateKey: env.push.privateKey,
        publicKey: env.push.publicKey,
        subject: env.push.subject,
      });
}
