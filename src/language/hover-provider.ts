/**
 * Hover provider — shows DOCSIS field documentation on hover
 * using x-docsis-* metadata from the schema.
 */
import * as monaco from "monaco-editor";
import { getLocation } from "jsonc-parser";
import type { DocsisFieldMeta } from "../schema/metadata";

/**
 * Formats metadata into a markdown hover string.
 */
function formatHover(path: string, meta: DocsisFieldMeta): string {
  const parts: string[] = [];

  parts.push(`**\`${path}\`**`);
  if (meta.description) parts.push(meta.description);
  if (meta["x-docsis-tlvType"]) parts.push(`**TLV Type:** \`${meta["x-docsis-tlvType"]}\``);
  if (meta["x-docsis-dataType"]) parts.push(`**Wire Type:** \`${meta["x-docsis-dataType"]}\``);
  if (meta["x-docsis-spec"]) parts.push(`**Spec:** ${meta["x-docsis-spec"]}`);
  if (meta["x-docsis-default"] !== undefined) parts.push(`**Default:** \`${meta["x-docsis-default"]}\``);
  if (meta["x-docsis-tlvLength"] !== undefined) parts.push(`**TLV Length:** ${meta["x-docsis-tlvLength"]} bytes`);
  if (meta["x-docsis-repeatable"]) parts.push("*Repeatable*");

  if (meta["x-docsis-validValues"]) {
    parts.push("");
    parts.push("**Valid Values:**");
    parts.push("| Value | Meaning |");
    parts.push("|-------|---------|");
    for (const [value, meaning] of Object.entries(meta["x-docsis-validValues"])) {
      parts.push(`| \`${value}\` | ${meaning} |`);
    }
  }

  return parts.join("\n\n");
}

/**
 * Registers a HoverProvider for the JSON language.
 * Uses jsonc-parser to determine the JSON path at the cursor,
 * then looks up x-docsis-* metadata from the index.
 */
export function registerHoverProvider(
  metadataIndex: Map<string, DocsisFieldMeta>,
): monaco.IDisposable {
  return monaco.languages.registerHoverProvider("json", {
    provideHover(
      model: monaco.editor.ITextModel,
      position: monaco.Position,
    ): monaco.languages.Hover | null {
      const text = model.getValue();
      const offset = model.getOffsetAt(position);
      const location = getLocation(text, offset);

      if (!location.path || location.path.length === 0) return null;

      // Build dot-separated path, skipping numeric array indices
      const pathParts = location.path.filter(
        (p): p is string => typeof p === "string",
      );
      if (pathParts.length === 0) return null;

      const dotPath = pathParts.join(".");
      const meta = metadataIndex.get(dotPath);
      if (!meta) return null;

      // Find the range of the word at the cursor for highlighting
      const word = model.getWordAtPosition(position);
      const range = word
        ? new monaco.Range(
            position.lineNumber,
            word.startColumn,
            position.lineNumber,
            word.endColumn,
          )
        : new monaco.Range(
            position.lineNumber,
            position.column,
            position.lineNumber,
            position.column,
          );

      return {
        range,
        contents: [{ value: formatHover(dotPath, meta) }],
      };
    },
  });
}
