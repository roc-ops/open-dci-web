/**
 * Editor setup — creates and configures the Monaco editor instance.
 */
import * as monaco from "monaco-editor";

/**
 * Creates a Monaco editor inside the given container element.
 * Returns the editor instance for external wiring (toolbar, status bar, etc.).
 */
export function createEditor(
  container: HTMLElement,
  initialContent?: string,
): monaco.editor.IStandaloneCodeEditor {
  const editor = monaco.editor.create(container, {
    value: initialContent ?? "",
    language: "json",
    theme: "vs-dark",
    automaticLayout: true,
    minimap: { enabled: true },
    wordWrap: "on",
    fontSize: 14,
    tabSize: 2,
    insertSpaces: true,
    renderWhitespace: "selection",
    scrollBeyondLastLine: false,
    bracketPairColorization: { enabled: true },
  });

  return editor;
}
