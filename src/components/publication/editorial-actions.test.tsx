import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { EditorialArticleActions } from "./editorial-actions";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const props = {
  canManage: true,
  lifecycleStatus: "published" as const,
  regenerateApiUrl: "/api/leagues/league-a/press/post-a/regenerate",
  retractApiUrl: "/api/leagues/league-a/press/post-a/retract",
};

function stubReload() {
  const reload = vi.fn();
  vi.stubGlobal("location", { ...window.location, reload });
  return reload;
}

function okFetch() {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
      status: 200,
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  router.refresh.mockClear();
});

test("retraction refreshes the route instead of reloading the document", async () => {
  const reload = stubReload();
  const fetchMock = okFetch();

  render(<EditorialArticleActions {...props} />);

  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Wrong final score" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Retract" }));

  await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  expect(fetchMock).toHaveBeenCalledWith(
    props.retractApiUrl,
    expect.objectContaining({ method: "POST" }),
  );
  expect(reload).not.toHaveBeenCalled();
  // The notice survives because client state is no longer thrown away.
  expect(await screen.findByText("Retraction recorded.")).toBeDefined();
});

test("regeneration refreshes the route instead of reloading the document", async () => {
  const reload = stubReload();
  const fetchMock = okFetch();

  render(<EditorialArticleActions {...props} />);

  fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));

  await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  expect(fetchMock).toHaveBeenCalledWith(
    props.regenerateApiUrl,
    expect.objectContaining({ method: "POST" }),
  );
  expect(reload).not.toHaveBeenCalled();
  expect(
    await screen.findByText("Regeneration queued through the cast."),
  ).toBeDefined();
});

test("a failed retraction neither refreshes nor reloads", async () => {
  const reload = stubReload();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ error: { message: "Not allowed" } }), {
      headers: { "content-type": "application/json" },
      status: 403,
    }),
  );

  render(<EditorialArticleActions {...props} />);

  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Wrong final score" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Retract" }));

  expect(await screen.findByRole("alert")).toBeDefined();
  expect(router.refresh).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();
});
