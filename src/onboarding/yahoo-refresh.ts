import { eq } from "drizzle-orm";
import { err, type Result } from "@/core/result";
import type { Db } from "@/db/client";
import { providerCredentials } from "@/db/schema";
import { AuthExpiredError, type ProviderError } from "@/providers/model";
import {
  type YahooCredentials,
  yahooCredentialsSchema,
} from "@/providers/yahoo/client";
import type { CredentialCipher } from "./credential-crypto";
import type { YahooOAuthClient } from "./yahoo-service";

export type YahooCredentialRefresher = Pick<
  YahooOAuthClient,
  "refreshCredentials"
>;

export async function refreshStoredYahooCredentials({
  credentialId,
  credentials,
  deps,
}: {
  credentialId: string;
  credentials: unknown;
  deps: {
    cipher: CredentialCipher;
    db: Db;
    now?: () => Date;
    yahooOAuthClient?: YahooCredentialRefresher;
  };
}): Promise<Result<YahooCredentials, ProviderError>> {
  const parsed = yahooCredentialsSchema.safeParse(credentials);
  if (!parsed.success || !parsed.data.refreshToken || !deps.yahooOAuthClient) {
    return err(new AuthExpiredError("yahoo"));
  }

  const refreshed = await deps.yahooOAuthClient.refreshCredentials({
    credentials: parsed.data,
  });
  if (!refreshed.ok) {
    return refreshed;
  }

  const now = deps.now?.() ?? new Date();
  await deps.db
    .update(providerCredentials)
    .set({
      encryptedPayload: deps.cipher.encryptJson(refreshed.value),
      invalidAt: null,
      lastValidatedAt: now,
      status: "connected",
      updatedAt: now,
    })
    .where(eq(providerCredentials.id, credentialId));

  return refreshed;
}
