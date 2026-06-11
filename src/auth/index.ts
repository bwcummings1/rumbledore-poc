import "server-only";
import { getEnv } from "@/core/env";
import { getDb } from "@/db";
import { type Auth, createAuth } from "./instance";

// Memoized on globalThis so dev-server HMR doesn't rebuild the auth instance.
const globalForAuth = globalThis as { __rumbledoreAuth?: Auth };

/** Lazily-initialized Better Auth instance bound to the validated env. */
export function getAuth(): Auth {
  if (!globalForAuth.__rumbledoreAuth) {
    const env = getEnv();
    globalForAuth.__rumbledoreAuth = createAuth(getDb(), {
      secret: env.auth.secret,
      baseURL: env.auth.url,
      google: env.auth.google,
    });
  }
  return globalForAuth.__rumbledoreAuth;
}

export type { Auth } from "./instance";
export { ac, roles } from "./permissions";
