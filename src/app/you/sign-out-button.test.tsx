import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignOutButton } from "./sign-out-button";

const router = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
}));
const calls = vi.hoisted((): string[] => []);
const authMocks = vi.hoisted(() => ({
  signOut: vi.fn(async () => {
    calls.push("signOut");
  }),
}));
const cleanupMocks = vi.hoisted(() => ({
  clearPwaSessionState: vi.fn(async () => {
    calls.push("cleanup");
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("@/lib/auth-client", () => ({
  signOut: authMocks.signOut,
}));

vi.mock("@/components/pwa/session-cleanup", () => ({
  clearPwaSessionState: cleanupMocks.clearPwaSessionState,
}));

afterEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
});

describe("SignOutButton", () => {
  it("clears PWA session state before signing out", async () => {
    render(<SignOutButton />);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(authMocks.signOut).toHaveBeenCalled());
    expect(calls).toEqual(["cleanup", "signOut"]);
    expect(router.replace).toHaveBeenCalledWith("/");
    expect(router.refresh).toHaveBeenCalled();
  });
});
