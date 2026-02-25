/**
 * Custom Monaco editor theme for the OpenDCI DOCSIS editor.
 */
import * as monaco from "monaco-editor";

export const THEME_NAME = "opendci-dark";

/**
 * Registers the opendci-dark theme with Monaco.
 * Call before creating the editor instance.
 */
export function registerTheme(): void {
  monaco.editor.defineTheme(THEME_NAME, {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#1a1d23",
      "editorLineNumber.foreground": "#5a6374",
      "editorLineNumber.activeForeground": "#9ca3b0",
    },
  });
}
