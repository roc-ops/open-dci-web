/**
 * Custom Monaco editor themes for the OpenDCI DOCSIS editor.
 */
import * as monaco from "monaco-editor";

export const THEME_DARK = "opendci-dark";
export const THEME_LIGHT = "opendci-light";

/** @deprecated Use THEME_DARK instead. Kept for backwards compatibility. */
export const THEME_NAME = THEME_DARK;

/**
 * Registers the opendci-dark and opendci-light themes with Monaco.
 * Call before creating the editor instance.
 */
export function registerTheme(): void {
  monaco.editor.defineTheme(THEME_DARK, {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#1a1d23",
      "editorLineNumber.foreground": "#5a6374",
      "editorLineNumber.activeForeground": "#9ca3b0",
    },
  });

  monaco.editor.defineTheme(THEME_LIGHT, {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#ffffff",
      "editorLineNumber.foreground": "#8b8b8b",
      "editorLineNumber.activeForeground": "#383a42",
    },
  });
}
