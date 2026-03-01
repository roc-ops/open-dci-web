/**
 * Shared helper functions for language providers.
 */
import type * as monaco from "monaco-editor";
import type { Node } from "jsonc-parser";

/**
 * Builds a dot-separated path from a JSON location path,
 * filtering out numeric array indices and keeping only string segments.
 *
 * Example: ["ServiceFlowDown", 0, "MaxSustainedRate"] -> "ServiceFlowDown.MaxSustainedRate"
 *
 * Returns `undefined` when no string segments remain (e.g. the path
 * contains only numeric indices).
 */
export function buildDotPath(path: (string | number)[]): string | undefined {
  const parts = path.filter((p): p is string => typeof p === "string");
  return parts.length > 0 ? parts.join(".") : undefined;
}

/**
 * Detect the indentation at a specific offset in the model by reading
 * the leading whitespace of the line containing that offset.
 *
 * Used by snmp-mib-codelens to detect the indent level of an array bracket.
 */
export function detectIndentAtOffset(
  model: monaco.editor.ITextModel,
  offset: number,
): string {
  const pos = model.getPositionAt(offset);
  const lineContent = model.getLineContent(pos.lineNumber);
  const match = lineContent.match(/^(\s*)/);
  return match ? match[1] : "";
}

/**
 * Detect the base indentation of the root JSON object by looking at
 * the leading whitespace of the first property's line.
 *
 * Falls back to two spaces when the object has no properties.
 *
 * Used by chunked-hex-codelens to determine indent for inserted properties.
 */
export function detectIndentOfRootObject(
  model: monaco.editor.ITextModel,
  rootNode: Node,
): string {
  if (!rootNode.children || rootNode.children.length === 0) return "  ";

  const firstProp = rootNode.children[0];
  const pos = model.getPositionAt(firstProp.offset);
  const lineContent = model.getLineContent(pos.lineNumber);
  const match = lineContent.match(/^(\s*)/);
  return match ? match[1] : "  ";
}
