import type { ProviderReconnectAction } from "@/onboarding/reconnect";

export interface OnboardingPanelError {
  message: string;
  reconnect?: ProviderReconnectAction;
}

interface ApiErrorPayload {
  error?: {
    details?: {
      reconnect?: unknown;
    };
    message?: string;
  };
}

class OnboardingRequestError extends Error {
  readonly reconnect: ProviderReconnectAction | undefined;

  constructor(message: string, reconnect?: ProviderReconnectAction) {
    super(message);
    this.name = "OnboardingRequestError";
    this.reconnect = reconnect;
  }
}

function isReconnectAction(value: unknown): value is ProviderReconnectAction {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybe = value as Record<string, unknown>;
  return (
    typeof maybe.provider === "string" &&
    typeof maybe.href === "string" &&
    typeof maybe.label === "string" &&
    typeof maybe.message === "string"
  );
}

export function onboardingPanelError(cause: unknown): OnboardingPanelError {
  if (cause instanceof OnboardingRequestError) {
    return {
      message: cause.message,
      ...(cause.reconnect ? { reconnect: cause.reconnect } : {}),
    };
  }

  return {
    message: cause instanceof Error ? cause.message : "Request failed",
  };
}

export async function requestJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(30_000),
  });
  const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload;
  if (!response.ok) {
    const reconnect = payload.error?.details?.reconnect;
    throw new OnboardingRequestError(
      payload.error?.message ?? "Request failed",
      isReconnectAction(reconnect) ? reconnect : undefined,
    );
  }
  return payload as T;
}

export async function postJson<T>(url: string, body?: unknown): Promise<T> {
  return requestJson<T>(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    method: "POST",
  });
}

export function getJson<T>(url: string): Promise<T> {
  return requestJson<T>(url, { method: "GET" });
}
