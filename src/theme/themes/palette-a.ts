import type { ThemeDefinition } from "../types";
import { neutralDarkTheme } from "./neutral-dark";

export const paletteATheme = {
  ...neutralDarkTheme,
  id: "palette-a",
  label: "Palette A",
} as const satisfies ThemeDefinition;
