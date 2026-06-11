import type { EspnCookieCredentials } from "@/providers/espn";

export interface BrowserSessionStartInput {
  sessionId: string;
  userId: string;
}

export interface BrowserSessionStart {
  sessionId: string;
  liveViewUrl: string;
}

export interface BrowserSession {
  start(input: BrowserSessionStartInput): Promise<BrowserSessionStart>;
  captureCredentials(sessionId: string): Promise<EspnCookieCredentials>;
  end(sessionId: string): Promise<void>;
}

export const MOCK_ESPN_CREDENTIALS: EspnCookieCredentials = {
  swid: "{00000000-0000-4000-8000-000000000001}",
  espn_s2: "fixture-session-value", // ubs:ignore — fake ESPN cookie value for mock onboarding
};

export class MockBrowserSession implements BrowserSession {
  async start(input: BrowserSessionStartInput): Promise<BrowserSessionStart> {
    return {
      sessionId: input.sessionId,
      liveViewUrl: `/onboarding/espn/mock-browser?session=${encodeURIComponent(input.sessionId)}`,
    };
  }

  async captureCredentials(): Promise<EspnCookieCredentials> {
    return MOCK_ESPN_CREDENTIALS;
  }

  async end(): Promise<void> {
    // The real provider will tear down the hosted browser. The mock has no external state.
  }
}
