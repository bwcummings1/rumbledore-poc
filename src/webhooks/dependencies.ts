import type { Env } from "@/core/env/schema";
import type { Db } from "@/db/client";
import { MockWebhookDeliverer, type WebhookDeliverer } from "./service";

export function createWebhookDeliverer(
  db: Db,
  env: Pick<Env, "auth">,
): WebhookDeliverer {
  return new MockWebhookDeliverer({
    appUrl: env.auth.url,
    db,
  });
}
