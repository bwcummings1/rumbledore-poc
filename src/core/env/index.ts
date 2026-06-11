import "server-only";
import { type Env, parseEnv } from "./schema";

let cached: Env | undefined;

/** Validated server environment — parsed once, throws on first access if invalid. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

export type { Env, GoogleOAuthConfig, ServiceConfig } from "./schema";
export { LOCAL_DATABASE_URL, LOCAL_REDIS_URL, parseEnv } from "./schema";
