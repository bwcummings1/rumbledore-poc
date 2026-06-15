import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INSTALL_DISMISS_STORAGE_KEY,
  InstallAffordance,
} from "./install-affordance";

type TestBeforeInstallPromptEvent = Event & {
  readonly userChoice: Promise<{
    readonly outcome: "accepted" | "dismissed";
    readonly platform: string;
  }>;
  prompt(): Promise<void>;
};

function mockNavigatorProperty<Key extends keyof Navigator>(
  key: Key,
  value: Navigator[Key],
) {
  Object.defineProperty(navigator, key, {
    configurable: true,
    value,
  });
}

function mockStandaloneMode(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: query === "(display-mode: standalone)" ? matches : false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
  Object.defineProperty(navigator, "standalone", {
    configurable: true,
    value: false,
  });
}

function mockUserAgent(userAgent: string, vendor = "Google Inc.") {
  mockNavigatorProperty("userAgent", userAgent);
  mockNavigatorProperty("vendor", vendor);
  mockNavigatorProperty("platform", "iPhone");
  mockNavigatorProperty("maxTouchPoints", 5);
}

function beforeInstallPromptEvent(
  outcome: "accepted" | "dismissed",
): TestBeforeInstallPromptEvent {
  const event = new Event(
    "beforeinstallprompt",
  ) as TestBeforeInstallPromptEvent;
  Object.defineProperties(event, {
    prompt: {
      value: vi.fn().mockResolvedValue(undefined),
    },
    userChoice: {
      value: Promise.resolve({ outcome, platform: "web" }),
    },
  });
  return event;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  mockUserAgent(
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
  );
  mockStandaloneMode(false);
});

describe("InstallAffordance", () => {
  it("shows the Android install control only after beforeinstallprompt fires", async () => {
    mockStandaloneMode(false);
    render(<InstallAffordance />);

    expect(
      screen.queryByRole("button", { name: "Add to home screen" }),
    ).toBeNull();

    const installEvent = beforeInstallPromptEvent("accepted");
    const preventDefault = vi.spyOn(installEvent, "preventDefault");
    fireEvent(window, installEvent);

    const button = await screen.findByRole("button", {
      name: "Add to home screen",
    });
    fireEvent.click(button);

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "Install started",
      ),
    );
    expect(preventDefault).toHaveBeenCalled();
    expect(installEvent.prompt).toHaveBeenCalled();
  });

  it("persists dismissal after the browser install prompt is dismissed", async () => {
    mockStandaloneMode(false);
    render(<InstallAffordance />);

    const installEvent = beforeInstallPromptEvent("dismissed");
    fireEvent(window, installEvent);
    fireEvent.click(
      await screen.findByRole("button", { name: "Add to home screen" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Add to home screen" }),
      ).toBeNull(),
    );
    expect(localStorage.getItem(INSTALL_DISMISS_STORAGE_KEY)).toBe("true");
  });

  it("hides when the appinstalled event fires", async () => {
    mockStandaloneMode(false);
    render(<InstallAffordance />);

    fireEvent(window, beforeInstallPromptEvent("accepted"));
    await screen.findByRole("button", { name: "Add to home screen" });
    fireEvent(window, new Event("appinstalled"));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Add to home screen" }),
      ).toBeNull(),
    );
  });

  it("does not render in standalone display mode", () => {
    mockStandaloneMode(true);
    render(<InstallAffordance />);

    fireEvent(window, beforeInstallPromptEvent("accepted"));

    expect(
      screen.queryByRole("button", { name: "Add to home screen" }),
    ).toBeNull();
  });

  it("shows iOS Safari Add to Home Screen instructions without a fake install button", async () => {
    mockUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
      "Apple Computer, Inc.",
    );
    mockStandaloneMode(false);

    render(<InstallAffordance />);

    expect(
      await screen.findByText(/In Safari, tap Share, then Add to Home Screen/i),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Hide tip" })).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Add to home screen" }),
    ).toBeNull();
  });

  it("does not show iOS instructions in non-Safari iOS browsers", () => {
    mockUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/125.0.0.0 Mobile/15E148 Safari/604.1",
      "Google Inc.",
    );
    mockStandaloneMode(false);

    render(<InstallAffordance />);

    expect(screen.queryByText(/In Safari, tap Share/i)).toBeNull();
  });
});
