import { createThemeCss } from "./registry";

export function ThemeTokenStyle() {
  return <style id="rumbledore-theme-tokens">{createThemeCss()}</style>;
}
