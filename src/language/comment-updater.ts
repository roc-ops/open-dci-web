/**
 * Comment updater — automatically updates inline JSONC comments
 * when a value changes for a field with x-docsis-validValues.
 *
 * Example: "DataRateUnitSetting": 2, // mega-bits per second (Mbps)
 * Change 2 → 3, comment auto-updates to: // giga-bits per second (Gbps)
 */
import * as monaco from "monaco-editor";
import { getLocation, visit, type Node } from "jsonc-parser";
import type { DocsisFieldMeta } from "../schema/metadata";

/**
 * Registers the comment updater on the given editor.
 * Listens for content changes and updates inline comments
 * for fields with x-docsis-validValues.
 */
export function registerCommentUpdater(
  editor: monaco.editor.IStandaloneCodeEditor,
  metadataIndex: Map<string, DocsisFieldMeta>,
): monaco.IDisposable {
  let isUpdating = false;

  return editor.onDidChangeModelContent((e) => {
    // Prevent infinite loops from our own edits
    if (isUpdating) return;

    const model = editor.getModel();
    if (!model) return;

    // Process each change
    for (const change of e.changes) {
      // Find the JSON path at the change location
      const text = model.getValue();
      const offset = model.getOffsetAt(
        new monaco.Position(change.range.startLineNumber, change.range.startColumn),
      );

      const location = getLocation(text, offset);
      if (!location.path || location.path.length === 0) continue;

      // Only care about value positions (not property keys)
      if (location.isAtPropertyKey) continue;

      // Build dot-separated path, skipping numeric array indices
      const pathParts = location.path.filter(
        (p): p is string => typeof p === "string",
      );
      if (pathParts.length === 0) continue;

      const dotPath = pathParts.join(".");
      const meta = metadataIndex.get(dotPath);
      if (!meta?.["x-docsis-validValues"]) continue;

      // Find the value node at this path to get the current value
      const valueNode = findValueNode(text, location.path);
      if (valueNode === undefined) continue;

      const label = meta["x-docsis-validValues"][String(valueNode)];
      if (label === undefined) continue;

      // Find the line where this value lives
      const valueOffset = findValueOffset(text, location.path);
      if (valueOffset === -1) continue;

      const valuePos = model.getPositionAt(valueOffset);
      const lineNumber = valuePos.lineNumber;
      const lineContent = model.getLineContent(lineNumber);

      // Check for existing inline comment on this line
      const commentMatch = lineContent.match(/\/\/\s*(.*)$/);
      const newComment = `// ${label}`;

      if (commentMatch) {
        // Update existing comment
        const commentStart = lineContent.indexOf("//");
        const existingComment = lineContent.slice(commentStart);
        if (existingComment.trim() === newComment.trim()) continue; // Already correct

        isUpdating = true;
        const editRange = new monaco.Range(
          lineNumber,
          commentStart + 1,
          lineNumber,
          lineContent.length + 1,
        );
        model.applyEdits([{ range: editRange, text: newComment }]);
        isUpdating = false;
      } else {
        // Insert new comment after the value
        // Find the right place: after the value and any trailing comma
        const trimmed = lineContent.trimEnd();
        const insertCol = trimmed.length + 1;

        isUpdating = true;
        const editRange = new monaco.Range(
          lineNumber,
          insertCol,
          lineNumber,
          insertCol,
        );
        model.applyEdits([{ range: editRange, text: ` ${newComment}` }]);
        isUpdating = false;
      }
    }
  });
}

/**
 * Finds the current value at the given JSON path in the text.
 */
function findValueNode(
  text: string,
  path: (string | number)[],
): string | number | boolean | null | undefined {
  let result: string | number | boolean | null | undefined;
  let currentPath: (string | number)[] = [];

  visit(text, {
    onLiteralValue(value, offset, length, startLine, startChar, pathSupplier) {
      const nodePath = pathSupplier();
      if (pathsEqual(nodePath, path)) {
        result = value;
      }
    },
  });

  return result;
}

/**
 * Finds the offset of the value at the given JSON path.
 */
function findValueOffset(
  text: string,
  path: (string | number)[],
): number {
  let result = -1;

  visit(text, {
    onLiteralValue(value, offset, length, startLine, startChar, pathSupplier) {
      const nodePath = pathSupplier();
      if (pathsEqual(nodePath, path)) {
        result = offset;
      }
    },
  });

  return result;
}

/**
 * Compares two JSON paths for equality.
 */
function pathsEqual(
  a: (string | number)[],
  b: (string | number)[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, i) => val === b[i]);
}
