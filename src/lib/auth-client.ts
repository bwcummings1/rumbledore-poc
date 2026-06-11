"use client";

import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { ac, roles } from "@/auth/permissions";

/**
 * Browser-side auth client (same-origin baseURL). The organization plugin is
 * configured with the same access-control roles as the server so
 * `checkRolePermission` agrees with server-side `hasPermission`.
 */
export const authClient = createAuthClient({
  plugins: [organizationClient({ ac, roles })],
});

export const { signIn, signUp, signOut, useSession } = authClient;
