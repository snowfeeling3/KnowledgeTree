import { readStored } from "../lifecycle/preferences";
export type ThemeName = "everforest" | "light" | "dark";

export const THEMES: Array<[ThemeName, string]> = [
  ["everforest", "Everforest"],
  ["light", "浅色"],
  ["dark", "深色"],
];

export function readTheme(): ThemeName {
  try {
    const value = readStored<string>("kt-theme", "everforest");
    if (value === "light" || value === "dark" || value === "everforest") return value;
  } catch {
    return "everforest";
  }
  return "everforest";
}
