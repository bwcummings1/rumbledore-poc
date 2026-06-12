import "server-only";
import { type Env, parseEnv } from "./schema";

let cached: Env | undefined;

/** Validated server environment — parsed once, throws on first access if invalid. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

export type {
  Env,
  GoogleOAuthConfig,
  InngestConfig,
  PushConfig,
  ServiceConfig,
} from "./schema";
export {
  DEV_PUSH_PUBLIC_KEY,
  INNGEST_CLOUD_API_BASE_URL,
  INNGEST_CLOUD_EVENT_BASE_URL,
  LOCAL_DATABASE_URL,
  LOCAL_INNGEST_DEV_SERVER_URL,
  LOCAL_REDIS_URL,
  parseEnv,
} from "./schema";
