import type { FantasyProviderId } from "@/providers/ids";

export interface ProviderReconnectAction {
  provider: FantasyProviderId;
  href: string;
  label: string;
  message: string;
}

const providerReconnectActions = {
  espn: {
    provider: "espn",
    href: "/onboarding/espn",
    label: "Reconnect ESPN",
    message: "Your ESPN connection needs fresh cookies before imports can run.",
  },
  sleeper: {
    provider: "sleeper",
    href: "/onboarding/sleeper",
    label: "Reconnect Sleeper",
    message:
      "Your Sleeper account lookup needs to be refreshed before imports can run.",
  },
  yahoo: {
    provider: "yahoo",
    href: "/onboarding/yahoo",
    label: "Reconnect Yahoo",
    message: "Your Yahoo authorization expired before imports could run.",
  },
} satisfies Record<FantasyProviderId, ProviderReconnectAction>;

export function reconnectActionForProvider(
  provider: FantasyProviderId,
): ProviderReconnectAction {
  return providerReconnectActions[provider];
}
