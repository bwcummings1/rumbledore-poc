import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import type { GoogleOAuthConfig } from "@/core/env/schema";
import type { Db } from "@/db/client";
import {
  accounts,
  invitations,
  leagues,
  members,
  sessions,
  users,
  verifications,
} from "@/db/schema";
import { ac, roles } from "./permissions";
import { createRedisSecondaryStorage } from "./redis-secondary-storage";

/**
 * Pure Better Auth factory (mirrors `createDb`): no env/server-only imports,
 * so integration tests can build an instance against the local stack. The
 * app-facing memoized instance lives in `src/auth/index.ts`.
 */

export interface AuthOptions {
  secret: string;
  baseURL: string;
  google: GoogleOAuthConfig;
  redisUrl: string;
}

// Placeholder Google creds keep the OAuth routes mounted with zero config;
// real creds drop in via env (GOOGLE_CLIENT_ID/SECRET) with no code change.
const MOCK_GOOGLE = {
  clientId: "mock-google-client-id",
  clientSecret: "mock-google-client-secret", // ubs:ignore — placeholder, not a credential
};

export function createAuth(db: Db, options: AuthOptions) {
  return betterAuth({
    secret: options.secret,
    baseURL: options.baseURL,
    database: drizzleAdapter(db, {
      provider: "pg",
      // Keyed by Better Auth model name → our drizzle table. league=org:
      // the organization model reads the `leagues` table directly.
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
        organization: leagues,
        member: members,
        invitation: invitations,
      },
    }),
    rateLimit: {
      enabled: true,
      storage: "secondary-storage",
      window: 60,
      max: 100,
      customRules: {
        "/api/auth/sign-in/*": { max: 5, window: 60 },
        "/api/auth/sign-up/*": { max: 5, window: 60 },
        "/sign-in/*": { max: 5, window: 60 },
        "/sign-up/*": { max: 5, window: 60 },
      },
    },
    secondaryStorage: createRedisSecondaryStorage(options.redisUrl),
    // All ids are uuid columns with DB defaults — let Postgres generate them.
    advanced: { database: { generateId: false } },
    user: {
      // Better Auth's `name` lives in our `display_name` column.
      fields: { name: "displayName" },
    },
    emailAndPassword: { enabled: true },
    socialProviders: {
      google: options.google.mock
        ? MOCK_GOOGLE
        : {
            clientId: options.google.clientId,
            clientSecret: options.google.clientSecret,
          },
    },
    plugins: [
      organization({
        ac,
        roles,
        creatorRole: "commissioner",
        // Leagues are created by domain code (ingestion/onboarding) with the
        // required provider identity — never via createOrganization, whose
        // insert would violate the NOT NULL provider columns.
        allowUserToCreateOrganization: false,
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
