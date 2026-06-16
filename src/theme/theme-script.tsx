import {
  coerceThemeId,
  DEFAULT_THEME_ID,
  isRegisteredThemeId,
  REGISTERED_THEMES,
  type RegisteredThemeId,
} from "./registry";
import {
  MOTION_ATTRIBUTE,
  MOTION_OFF_VALUE,
  MOTION_ON_VALUE,
  MOTION_STORAGE_KEY,
  PERFORMANCE_ATTRIBUTE,
  PERFORMANCE_CONSTRAINED_VALUE,
  PERFORMANCE_FULL_VALUE,
  THEME_COOKIE_NAME,
  THEME_STORAGE_KEY,
  THEME_SYSTEM_STORAGE_VALUE,
} from "./settings";
import type { ThemeMode } from "./types";

const MODE_THEME_IDS = {
  dark: "auspex",
  light: "neutral-light",
} as const satisfies Record<ThemeMode, RegisteredThemeId>;

interface ThemeScriptMetadata {
  readonly mode: ThemeMode;
  readonly colorScheme: ThemeMode;
}

interface ThemePreloadState {
  readonly themeId: RegisteredThemeId;
  readonly mode: ThemeMode;
  readonly colorScheme: ThemeMode;
}

const THEME_SCRIPT_METADATA = Object.fromEntries(
  REGISTERED_THEMES.map((theme) => [
    theme.id,
    { mode: theme.mode, colorScheme: theme.colorScheme },
  ]),
) as Record<RegisteredThemeId, ThemeScriptMetadata>;

export function ThemePreloadScript({
  initialThemeId = DEFAULT_THEME_ID,
}: {
  readonly initialThemeId?: string | null;
}) {
  return (
    <script id="rumbledore-theme-preload" suppressHydrationWarning>
      {createThemePreloadScript(initialThemeId)}
    </script>
  );
}

export function resolveThemePreloadState({
  initialThemeId = DEFAULT_THEME_ID,
  prefersLight = false,
  storedTheme = null,
}: {
  readonly initialThemeId?: string | null;
  readonly prefersLight?: boolean;
  readonly storedTheme?: string | null;
} = {}): ThemePreloadState {
  const fallbackThemeId = coerceThemeId(initialThemeId);
  const themeId = resolveThemeId({
    fallbackThemeId,
    prefersLight,
    storedTheme,
  });
  const theme = THEME_SCRIPT_METADATA[themeId];

  return {
    themeId,
    mode: theme.mode,
    colorScheme: theme.colorScheme,
  };
}

export function createThemePreloadScript(
  initialThemeId: string | null | undefined = DEFAULT_THEME_ID,
): string {
  return `(() => {
  const themes = ${JSON.stringify(THEME_SCRIPT_METADATA)};
  const defaultThemeId = ${JSON.stringify(coerceThemeId(initialThemeId))};
  const modeThemeIds = ${JSON.stringify(MODE_THEME_IDS)};
  const storageKey = ${JSON.stringify(THEME_STORAGE_KEY)};
  const cookieName = ${JSON.stringify(THEME_COOKIE_NAME)};
  const systemValue = ${JSON.stringify(THEME_SYSTEM_STORAGE_VALUE)};
  const motionStorageKey = ${JSON.stringify(MOTION_STORAGE_KEY)};
  const motionAttribute = ${JSON.stringify(MOTION_ATTRIBUTE)};
  const motionOffValue = ${JSON.stringify(MOTION_OFF_VALUE)};
  const motionOnValue = ${JSON.stringify(MOTION_ON_VALUE)};
  const performanceAttribute = ${JSON.stringify(PERFORMANCE_ATTRIBUTE)};
  const performanceFullValue = ${JSON.stringify(PERFORMANCE_FULL_VALUE)};
  const performanceConstrainedValue = ${JSON.stringify(PERFORMANCE_CONSTRAINED_VALUE)};

  function readStoredTheme() {
    try {
      const storedTheme = window.localStorage.getItem(storageKey);
      if (storedTheme) return storedTheme;
    } catch {}

    const cookiePrefix = cookieName + "=";
    const themeCookie = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(cookiePrefix));
    return themeCookie ? decodeURIComponent(themeCookie.slice(cookiePrefix.length)) : null;
  }

  function resolveSystemTheme() {
    const prefersLight =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: light)").matches;
    return prefersLight ? modeThemeIds.light : modeThemeIds.dark;
  }

  function resolveThemeId() {
    const storedTheme = readStoredTheme();
    if (storedTheme === systemValue) return resolveSystemTheme();
    if (storedTheme && themes[storedTheme]) return storedTheme;
    if (themes[defaultThemeId]) return defaultThemeId;
    return ${JSON.stringify(DEFAULT_THEME_ID)};
  }

  const themeId = resolveThemeId();
  const theme = themes[themeId] || themes[${JSON.stringify(DEFAULT_THEME_ID)}];
  const root = document.documentElement;
  root.setAttribute("data-theme", themeId);
  root.classList.remove("dark", "light");
  root.classList.add(theme.mode);
  root.style.colorScheme = theme.colorScheme;

  function resolveMotionPreference() {
    const prefersReduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return motionOffValue;

    try {
      return window.localStorage.getItem(motionStorageKey) === motionOffValue
        ? motionOffValue
        : motionOnValue;
    } catch {}

    return motionOnValue;
  }

  function resolvePerformancePreference() {
    try {
      const nav = window.navigator || {};
      const connection =
        nav.connection || nav.mozConnection || nav.webkitConnection || null;
      const effectiveType =
        connection && typeof connection.effectiveType === "string"
          ? connection.effectiveType
          : "";
      const saveData = Boolean(connection && connection.saveData === true);
      const deviceMemory =
        typeof nav.deviceMemory === "number" ? nav.deviceMemory : null;
      const hardwareConcurrency =
        typeof nav.hardwareConcurrency === "number"
          ? nav.hardwareConcurrency
          : null;
      const compactViewport =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(max-width: 767px)").matches;
      const slowConnection =
        saveData ||
        effectiveType === "slow-2g" ||
        effectiveType === "2g" ||
        (compactViewport && effectiveType === "3g");
      const lowMemory =
        typeof deviceMemory === "number" && deviceMemory > 0 && deviceMemory <= 2;
      const lowCpu =
        typeof hardwareConcurrency === "number" &&
        hardwareConcurrency > 0 &&
        hardwareConcurrency <= 4;

      if (slowConnection || (compactViewport && (lowMemory || lowCpu)) || (lowMemory && lowCpu)) {
        return performanceConstrainedValue;
      }
    } catch {}

    return performanceFullValue;
  }

  root.setAttribute(motionAttribute, resolveMotionPreference());
  root.setAttribute(performanceAttribute, resolvePerformancePreference());
})();`;
}

function resolveThemeId({
  fallbackThemeId,
  prefersLight,
  storedTheme,
}: {
  readonly fallbackThemeId: RegisteredThemeId;
  readonly prefersLight: boolean;
  readonly storedTheme: string | null;
}): RegisteredThemeId {
  if (storedTheme === THEME_SYSTEM_STORAGE_VALUE) {
    return prefersLight ? MODE_THEME_IDS.light : MODE_THEME_IDS.dark;
  }
  if (isRegisteredThemeId(storedTheme)) {
    return storedTheme;
  }
  return fallbackThemeId;
}
