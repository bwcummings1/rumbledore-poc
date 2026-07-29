import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "@/core/logging";
import { RouteErrorState } from "./route-error-state";

vi.mock("@/core/logging", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function boomWith(overrides: { digest?: string; message?: string } = {}) {
  const error = new Error(
    overrides.message ?? "connect ECONNREFUSED 127.0.0.1:5440",
  ) as Error & { digest?: string };
  if (overrides.digest) {
    error.digest = overrides.digest;
  }
  return error;
}

describe("RouteErrorState", () => {
  it("shows human copy and a working retry", () => {
    const reset = vi.fn();

    render(
      <RouteErrorState
        body="This league section could not be loaded."
        error={boomWith()}
        reset={reset}
        segment="leagues/[leagueId]"
        title="This league would not load"
      />,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "This league would not load",
      }),
    ).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("never renders the error message", () => {
    render(
      <RouteErrorState
        error={boomWith({ message: "password=hunter2 at /srv/app/db.ts:41" })}
        reset={vi.fn()}
        segment="root"
      />,
    );

    expect(document.body.textContent).not.toContain("hunter2");
    expect(document.body.textContent).not.toContain("/srv/app/db.ts");
    expect(document.body.textContent).not.toContain("password");
  });

  it("never renders a stack trace", () => {
    const error = boomWith();
    error.stack = "Error: boom\n    at secretHandler (/srv/app/secret.ts:12:3)";

    render(<RouteErrorState error={error} reset={vi.fn()} segment="root" />);

    expect(document.body.textContent).not.toContain("secretHandler");
    expect(document.body.textContent).not.toContain("at ");
  });

  it("shows the digest as an opaque support reference", () => {
    render(
      <RouteErrorState
        error={boomWith({ digest: "3915430531" })}
        reset={vi.fn()}
        segment="root"
      />,
    );

    expect(screen.getByText(/Reference 3915430531/)).toBeDefined();
  });

  it("omits the reference line when Next.js supplied no digest", () => {
    render(
      <RouteErrorState error={boomWith()} reset={vi.fn()} segment="root" />,
    );

    expect(screen.queryByText(/Reference/)).toBeNull();
  });

  it("logs the segment and digest without the message or stack", () => {
    render(
      <RouteErrorState
        error={boomWith({ digest: "3915430531", message: "password=hunter2" })}
        reset={vi.fn()}
        segment="news"
      />,
    );

    expect(logger.error).toHaveBeenCalledWith("route_error_boundary", {
      digest: "3915430531",
      segment: "news",
    });
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain(
      "hunter2",
    );
  });
});
