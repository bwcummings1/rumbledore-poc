import type { ThemeDefinition } from "../types";
import { neutralDarkTheme } from "./neutral-dark";

export const paletteBTheme = {
  ...neutralDarkTheme,
  id: "palette-b",
  label: "Palette B",
} as const satisfies ThemeDefinition;
