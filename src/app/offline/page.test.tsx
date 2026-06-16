import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import OfflinePage from "./page";

describe("OfflinePage", () => {
  it("renders the AUSPEX offline shell without promising cached league data", () => {
    const { container } = render(<OfflinePage />);

    expect(screen.getByRole("main")).toBeDefined();
    expect(screen.getByRole("status").textContent).toContain("OFFLINE");
    expect(screen.getByText(/live league data/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /Retry/i })).toBeDefined();
    expect(container.querySelector(".orb")?.getAttribute("data-state")).toBe(
      "offline",
    );
    expect(screen.queryByText(/cached league data/i)).toBeNull();
  });
});
