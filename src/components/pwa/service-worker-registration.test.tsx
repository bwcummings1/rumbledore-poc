import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerServiceWorker,
  ServiceWorkerRegistration,
} from "./service-worker-registration";

function mockServiceWorkerContainer() {
  const register = vi.fn().mockResolvedValue({} as ServiceWorkerRegistration);
  Object.defineProperty(navigator, "serviceWorker", {
    value: { register },
    configurable: true,
  });
  return register;
}

afterEach(() => {
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
});

describe("registerServiceWorker", () => {
  it("registers /sw.js when the browser supports service workers", async () => {
    const register = mockServiceWorkerContainer();
    await registerServiceWorker();
    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  it("returns null when service workers are unsupported", () => {
    expect(registerServiceWorker()).toBeNull();
  });
});

describe("ServiceWorkerRegistration", () => {
  it("renders nothing and skips registration outside production", () => {
    const register = mockServiceWorkerContainer();
    const { container } = render(<ServiceWorkerRegistration />);
    expect(container.innerHTML).toBe("");
    expect(register).not.toHaveBeenCalled();
  });
});
