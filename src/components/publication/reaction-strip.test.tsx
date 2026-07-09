import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  CONTENT_REACTION_DISPLAY,
  CONTENT_REACTION_EMOJIS,
  type ContentReactionSummary,
} from "@/content/reaction-types";
import { ContentReactionStrip } from "./reaction-strip";

function summary(
  overrides: Partial<ContentReactionSummary> = {},
): ContentReactionSummary {
  return {
    apiUrl: "/api/leagues/league-1/press/post-1/reactions",
    counts: CONTENT_REACTION_EMOJIS.map((emoji) => ({
      count: emoji === "fire" ? 2 : 0,
      emoji,
      ...CONTENT_REACTION_DISPLAY[emoji],
    })),
    currentEmoji: "fire",
    total: 2,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("content reaction strip posts recastable reactions", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify(
        summary({
          counts: CONTENT_REACTION_EMOJIS.map((emoji) => ({
            count: emoji === "skull" ? 3 : emoji === "fire" ? 1 : 0,
            emoji,
            ...CONTENT_REACTION_DISPLAY[emoji],
          })),
          currentEmoji: "skull",
          total: 4,
        }),
      ),
      { headers: { "content-type": "application/json" }, status: 200 },
    ),
  );

  const { container } = render(
    <ContentReactionStrip summary={summary()} variant="article" />,
  );

  expect(
    container.querySelector('[data-slot="content-reactions"]'),
  ).toBeTruthy();
  expect(screen.getByText("2 total")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: /skull reaction/i }));

  await waitFor(() => {
    expect(screen.getByText("4 total")).toBeDefined();
  });
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/leagues/league-1/press/post-1/reactions",
    expect.objectContaining({
      body: JSON.stringify({ emoji: "skull" }),
      method: "POST",
    }),
  );
  expect(
    screen
      .getByRole("button", { name: /skull reaction, 3 votes/i })
      .getAttribute("aria-pressed"),
  ).toBe("true");
});

test("content reaction strip renders read-only counts without an API URL", () => {
  render(<ContentReactionStrip summary={summary({ apiUrl: undefined })} />);

  expect(
    screen
      .getByRole("button", { name: /fire reaction, 2 votes/i })
      .hasAttribute("disabled"),
  ).toBe(true);
});
