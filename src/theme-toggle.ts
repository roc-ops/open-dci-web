/**
 * Theme toggle — manages dark/light theme switching with localStorage
 * persistence and prefers-color-scheme detection.
 */
import * as monaco from "monaco-editor";
import { THEME_DARK, THEME_LIGHT } from "./editor/theme";

const STORAGE_KEY = "opendci-theme";

type Theme = "dark" | "light";

function detectPreferredTheme(): Theme {
  if (window.matchMedia("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  return "dark";
}

function getStoredTheme(): Theme | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return null;
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  monaco.editor.setTheme(theme === "dark" ? THEME_DARK : THEME_LIGHT);
}

/**
 * Initialises the theme based on localStorage or prefers-color-scheme,
 * applies it to the document and Monaco editor, and returns helpers for
 * toggling and querying the current theme.
 */
export function initTheme(
  _editor: monaco.editor.IStandaloneCodeEditor,
): { toggle: () => void; getCurrentTheme: () => Theme } {
  let current: Theme = getStoredTheme() ?? detectPreferredTheme();
  applyTheme(current);

  return {
    toggle(): void {
      current = current === "dark" ? "light" : "dark";
      localStorage.setItem(STORAGE_KEY, current);
      applyTheme(current);
    },
    getCurrentTheme(): Theme {
      return current;
    },
  };
}
