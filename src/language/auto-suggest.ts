/**
 * Auto-suggest trigger — programmatically opens Monaco's suggest widget
 * when the user types structural characters (comma, Enter, opening braces)
 * inside JSON objects or arrays, so they immediately see valid completions
 * without having to type a letter first.
 */
import * as monaco from "monaco-editor";
import { getLocation } from "jsonc-parser";

/** Characters that should trigger the suggest popup. */
const TRIGGER_CHARS = new Set([",", "{", "["]);

/**
 * Registers the auto-suggest trigger on the given editor.
 * Returns a disposable to unregister the listener.
 */
export function registerAutoSuggest(
  editor: monaco.editor.IStandaloneCodeEditor,
): monaco.IDisposable {
  return editor.onDidChangeModelContent((e) => {
    const model = editor.getModel();
    if (!model) return;

    for (const change of e.changes) {
      const inserted = change.text;

      // Check if the inserted text is a trigger character or a newline
      // after a line ending with a comma
      const isTriggerChar = inserted.length === 1 && TRIGGER_CHARS.has(inserted);
      const isNewline = inserted === "\n" || inserted === "\r\n";

      if (!isTriggerChar && !isNewline) continue;

      if (isNewline) {
        // Only trigger on newline if the previous line ends with a comma
        // (i.e., user pressed Enter after finishing a property)
        const lineNumber = change.range.startLineNumber;
        const lineContent = model.getLineContent(lineNumber).trimEnd();
        if (!lineContent.endsWith(",")) continue;
      }

      // Verify we're inside a JSON object or array (not at root level or in a string)
      const cursorPos = editor.getPosition();
      if (!cursorPos) continue;

      const text = model.getValue();
      const offset = model.getOffsetAt(cursorPos);
      const location = getLocation(text, offset);

      // Must have a path (inside a structure, not at top level)
      if (!location.path || location.path.length === 0) continue;

      // Trigger suggest after a brief delay to let Monaco process the character
      setTimeout(() => {
        editor.trigger("auto-suggest", "editor.action.triggerSuggest", {});
      }, 50);

      // Only process the first matching change
      break;
    }
  });
}
