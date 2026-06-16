import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  THEME_COOKIE_NAME,
  THEME_STORAGE_KEY,
  THEME_SYSTEM_STORAGE_VALUE,
} from "./settings";
import { ThemeProvider, useTheme } from "./theme-provider";
import {
  createThemePreloadScript,
  resolveThemePreloadState,
} from "./theme-script";

afterEach(() => {
  cleanup();
  // biome-ignore lint/suspicious/noDocumentCookie: test cleanup must reset the SSR theme cookie.
  document.cookie = `${THEME_COOKIE_NAME}=; Path=/; Max-Age=0`;
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("dark", "light");
  document.documentElement.removeAttribute("style");
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("ThemeProvider", () => {
  it("applies the initial theme to the document and exposes registered themes", async () => {
    render(
      <ThemeProvider initialThemeId="auspex">
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme-state").textContent).toBe("auspex:dark:5");
    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe(
        "auspex",
      );
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("switches themes globally and persists the choice", async () => {
    render(
      <ThemeProvider initialThemeId="neutral-dark">
        <ThemeProbe />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Use light" }));

    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe(
        "neutral-light",
      );
    });
    expect(screen.getByTestId("theme-state").textContent).toBe(
      "neutral-light:light:5",
    );
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(
      "neutral-light",
    );
    expect(document.cookie).toContain(`${THEME_COOKIE_NAME}=neutral-light`);
  });

  it("can switch mode without exposing a picker UI", async () => {
    render(
      <ThemeProvider initialThemeId="neutral-light">
        <ThemeProbe />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Use dark mode" }));

    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe(
        "auspex",
      );
    });
    expect(screen.getByTestId("theme-state").textContent).toBe("auspex:dark:5");
  });

  it("hydrates from the pre-painted document theme when it differs from the server prop", () => {
    document.documentElement.setAttribute("data-theme", "palette-a");

    render(
      <ThemeProvider initialThemeId="neutral-dark">
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme-state").textContent).toBe(
      "palette-a:dark:5",
    );
  });
});

describe("theme preload script", () => {
  it("resolves a persisted registered theme before React hydrates", () => {
    expect(
      resolveThemePreloadState({
        initialThemeId: "auspex",
        storedTheme: "neutral-light",
      }),
    ).toEqual({
      colorScheme: "light",
      mode: "light",
      themeId: "neutral-light",
    });
  });

  it("can resolve a system preference to the matching registered mode theme", () => {
    expect(
      resolveThemePreloadState({
        initialThemeId: "auspex",
        prefersLight: true,
        storedTheme: THEME_SYSTEM_STORAGE_VALUE,
      }),
    ).toMatchObject({
      colorScheme: "light",
      mode: "light",
      themeId: "neutral-light",
    });
  });

  it("generates a pre-paint script from registered constants", () => {
    const script = createThemePreloadScript("palette-b");

    expect(script).toContain('root.setAttribute("data-theme", themeId)');
    expect(script).toContain('"palette-b"');
    expect(script).toContain('"auspex"');
    expect(script).toContain(THEME_STORAGE_KEY);
    expect(script).toContain(THEME_COOKIE_NAME);
  });
});

function ThemeProbe() {
  const { mode, setMode, setTheme, themeId, themes } = useTheme();

  return (
    <div>
      <output data-testid="theme-state">
        {themeId}:{mode}:{themes.length}
      </output>
      <button type="button" onClick={() => setTheme("neutral-light")}>
        Use light
      </button>
      <button type="button" onClick={() => setTheme("palette-b")}>
        Use palette B
      </button>
      <button type="button" onClick={() => setMode("dark")}>
        Use dark mode
      </button>
    </div>
  );
}
