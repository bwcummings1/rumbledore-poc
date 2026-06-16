"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  coerceThemeId,
  DEFAULT_THEME_ID,
  getThemeById,
  isRegisteredThemeId,
  REGISTERED_THEMES,
  type RegisteredThemeId,
} from "./registry";
import {
  THEME_COOKIE_MAX_AGE_SECONDS,
  THEME_COOKIE_NAME,
  THEME_STORAGE_KEY,
  THEME_SYSTEM_STORAGE_VALUE,
} from "./settings";
import type { ThemeDefinition, ThemeMode } from "./types";

const MODE_THEME_IDS = {
  dark: "neutral-dark",
  light: "neutral-light",
} as const satisfies Record<ThemeMode, RegisteredThemeId>;

interface ThemeContextValue {
  readonly theme: ThemeDefinition;
  readonly themeId: RegisteredThemeId;
  readonly mode: ThemeMode;
  readonly themes: readonly ThemeDefinition[];
  readonly setTheme: (themeId: RegisteredThemeId) => void;
  readonly setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  initialThemeId = DEFAULT_THEME_ID,
}: {
  readonly children: ReactNode;
  readonly initialThemeId?: string | null;
}) {
  const [themeId, setThemeId] = useState<RegisteredThemeId>(() =>
    resolveInitialThemeId(initialThemeId),
  );
  const theme = getRegisteredTheme(themeId);

  useEffect(() => {
    applyThemeToDocument(theme);
    persistThemeChoice(theme.id);
  }, [theme]);

  const setTheme = useCallback((nextThemeId: RegisteredThemeId) => {
    setThemeId(coerceThemeId(nextThemeId));
  }, []);

  const setMode = useCallback((mode: ThemeMode) => {
    setThemeId(MODE_THEME_IDS[mode]);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      themeId: theme.id as RegisteredThemeId,
      mode: theme.mode,
      themes: REGISTERED_THEMES,
      setTheme,
      setMode,
    }),
    [theme, setTheme, setMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

function resolveInitialThemeId(
  initialThemeId: string | null | undefined,
): RegisteredThemeId {
  if (typeof window === "undefined") {
    return coerceThemeId(initialThemeId);
  }

  return coerceThemeId(
    resolveStoredThemeId() ??
      document.documentElement.getAttribute("data-theme") ??
      initialThemeId,
  );
}

function resolveStoredThemeId(): RegisteredThemeId | null {
  const storedTheme = readStoredThemeChoice();
  if (storedTheme === THEME_SYSTEM_STORAGE_VALUE) {
    return getSystemThemeId();
  }
  return isRegisteredThemeId(storedTheme) ? storedTheme : null;
}

function readStoredThemeChoice(): string | null {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function getSystemThemeId(): RegisteredThemeId {
  const prefersLight =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: light)").matches;

  return prefersLight ? MODE_THEME_IDS.light : MODE_THEME_IDS.dark;
}

function getRegisteredTheme(themeId: RegisteredThemeId): ThemeDefinition {
  return getThemeById(themeId) ?? getRegisteredTheme(DEFAULT_THEME_ID);
}

function applyThemeToDocument(theme: ThemeDefinition): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme.id);
  root.classList.toggle("dark", theme.mode === "dark");
  root.classList.toggle("light", theme.mode === "light");
  root.style.colorScheme = theme.colorScheme;
}

function persistThemeChoice(themeId: string): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeId);
  } catch {
    // Persistence is best-effort; the document-level theme still applies.
  }

  // biome-ignore lint/suspicious/noDocumentCookie: the server reads this cookie to SSR the persisted theme before paint.
  document.cookie = [
    `${THEME_COOKIE_NAME}=${encodeURIComponent(themeId)}`,
    "Path=/",
    `Max-Age=${THEME_COOKIE_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
  ].join("; ");
}
