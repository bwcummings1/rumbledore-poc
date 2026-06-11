import type { Env } from "@/core/env/schema";
import type { RealtimePublisher } from "./interfaces";
import { NoopRealtimePublisher } from "./mocks";
import { SupabaseRealtimePublisher } from "./publisher";

export function createRealtimePublisher(
  env: Pick<Env, "realtime">,
): RealtimePublisher {
  return env.realtime.mock
    ? new NoopRealtimePublisher()
    : new SupabaseRealtimePublisher({
        apiKey: env.realtime.serviceRoleKey,
        url: env.realtime.url,
      });
}
