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
  PushConfig,
  ServiceConfig,
} from "./schema";
export {
  DEV_PUSH_PUBLIC_KEY,
  LOCAL_DATABASE_URL,
  LOCAL_REDIS_URL,
  parseEnv,
} from "./schema";
