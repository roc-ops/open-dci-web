/**
 * Completion provider — offers human-readable labels for
 * x-docsis-validValues when completing field values.
 */
import * as monaco from "monaco-editor";
import { getLocation } from "jsonc-parser";
import type { DocsisFieldMeta } from "../schema/metadata";

/**
 * Registers a CompletionItemProvider for the JSON language.
 * When the cursor is on a value position and the field has
 * x-docsis-validValues, offers completion items with
 * human-readable labels.
 */
export function registerCompletionProvider(
  metadataIndex: Map<string, DocsisFieldMeta>,
): monaco.IDisposable {
  return monaco.languages.registerCompletionItemProvider("json", {
    provideCompletionItems(
      model: monaco.editor.ITextModel,
      position: monaco.Position,
    ): monaco.languages.CompletionList | null {
      const text = model.getValue();
      const offset = model.getOffsetAt(position);
      const location = getLocation(text, offset);

      if (!location.path || location.path.length === 0) return null;

      // Only provide completions when on a value (not a property name)
      if (!location.isAtPropertyKey === undefined) return null;
      if (location.isAtPropertyKey) return null;

      // Build dot-separated path, skipping numeric array indices
      const pathParts = location.path.filter(
        (p): p is string => typeof p === "string",
      );
      if (pathParts.length === 0) return null;

      const dotPath = pathParts.join(".");
      const meta = metadataIndex.get(dotPath);
      if (!meta?.["x-docsis-validValues"]) return null;

      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn,
      );

      const suggestions: monaco.languages.CompletionItem[] = Object.entries(
        meta["x-docsis-validValues"],
      ).map(([value, label], index) => ({
        label: `${value} — ${label}`,
        kind: monaco.languages.CompletionItemKind.EnumMember,
        insertText: value,
        documentation: {
          value: `**${label}**\n\nValue: \`${value}\`${meta["x-docsis-tlvType"] ? `\n\nTLV: \`${meta["x-docsis-tlvType"]}\`` : ""}`,
        },
        range,
        sortText: String(index).padStart(4, "0"),
      }));

      return { suggestions };
    },
  });
}
