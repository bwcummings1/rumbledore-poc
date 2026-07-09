import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { DEFAULT_TONE_PROFILES, type LeagueToneProfileEditorData } from "@/ai";
import { PersonaToneEditorView } from "./persona-tone-editor-view";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refresh.mockClear();
});

const data = {
  cards: [
    {
      beat: "Editorial recaps.",
      enabled: true,
      history: [
        {
          id: "history-1",
          persona: "narrator",
          reason: "Baseline",
          source: "seed",
          sourceToneVersion: null,
          toneProfile: DEFAULT_TONE_PROFILES.narrator,
          toneUpdatedAt: "2026-07-09T10:00:00.000Z",
          toneUpdatedBy: "user-1",
          toneVersion: 1,
        },
      ],
      id: "card-1",
      name: "Narrator",
      performsWhen: ["weekly recaps"],
      persona: "narrator",
      pointOfView: DEFAULT_TONE_PROFILES.narrator.pointOfView,
      promptTemplate: "Narrate the week.",
      purpose: "Recaps",
      tone: "Editorial.",
      toneProfile: DEFAULT_TONE_PROFILES.narrator,
      toneUpdatedAt: "2026-07-09T10:00:00.000Z",
      toneUpdatedBy: "user-1",
      toneVersion: 2,
    },
  ],
  league: {
    id: "00000000-0000-4000-8000-000000000001",
    name: "NHS Alumni Annual",
    provider: "espn",
    providerLeagueId: "95050",
    season: 2026,
  },
} satisfies LeagueToneProfileEditorData;

test("PersonaToneEditorView renders editable tone controls and preview output", async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        body: "Preview body",
        promptSectionNames: ["tone"],
        sampleParagraph: "tone-editor-marker preview paragraph",
        title: "Narrator preview",
        toneVersion: 3,
      }),
      { status: 200 },
    ),
  );
  vi.stubGlobal("fetch", fetch);

  render(<PersonaToneEditorView data={data} />);

  expect(
    screen.getByRole("heading", { name: "NHS Alumni Annual Tone Editor" }),
  ).toBeDefined();
  expect(screen.getByText("Narrator")).toBeDefined();
  expect(screen.getByRole("button", { name: "Preview" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Save version" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Roll back" })).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Preview" }));

  await waitFor(() => {
    expect(fetch).toHaveBeenCalledWith(
      "/api/leagues/00000000-0000-4000-8000-000000000001/cast/personas/narrator/tone/preview",
      expect.objectContaining({ method: "POST" }),
    );
  });
  expect(await screen.findByText("Narrator preview")).toBeDefined();
  expect(
    screen.getByText("tone-editor-marker preview paragraph"),
  ).toBeDefined();
});
