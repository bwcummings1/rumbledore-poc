import type { RealtimeChannel } from "./interfaces";

export type RealtimeCapability =
  | "broadcast:read"
  | "presence:read"
  | "presence:write";

export interface RealtimeChannelGrant {
  topic: RealtimeChannel;
  private: true;
  capabilities: RealtimeCapability[];
}

export interface RealtimeSubscriptionGrant {
  token: string;
  issuedAt: string;
  expiresAt: string;
  ttlSeconds: number;
  channels: RealtimeChannelGrant[];
  transport:
    | { kind: "mock" }
    | { kind: "supabase"; url: string; publishableKey: string };
}

export type SupabaseRealtimeSubscriptionGrant = Omit<
  RealtimeSubscriptionGrant,
  "transport"
> & {
  transport: { kind: "supabase"; url: string; publishableKey: string };
};
