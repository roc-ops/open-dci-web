/**
 * Custom diagnostics — DOCSIS-specific validation beyond JSON Schema.
 *
 * Monaco's built-in JSON Schema validation handles structural and type
 * checking. This module adds DOCSIS-specific rules:
 * - x-docsis-validValues checking (warns when value is not in the set)
 */
import * as monaco from "monaco-editor";
import { visit } from "jsonc-parser";
import type { DocsisFieldMeta } from "../schema/metadata";

/** Owner string used to identify our custom markers. */
const MARKER_OWNER = "docsis-custom";

/**
 * Registers custom DOCSIS diagnostics on the given editor.
 * Validates values against x-docsis-validValues and sets markers.
 */
export function registerDiagnostics(
  editor: monaco.editor.IStandaloneCodeEditor,
  metadataIndex: Map<string, DocsisFieldMeta>,
): monaco.IDisposable {
  function validate(): void {
    const model = editor.getModel();
    if (!model) return;

    const text = model.getValue();
    const markers: monaco.editor.IMarkerData[] = [];

    visit(text, {
      onLiteralValue(value, offset, length, _startLine, _startChar, pathSupplier) {
        const path = pathSupplier();
        // Build dot-separated path, skipping numeric array indices
        const pathParts = path.filter((p): p is string => typeof p === "string");
        if (pathParts.length === 0) return;

        const dotPath = pathParts.join(".");
        const meta = metadataIndex.get(dotPath);
        if (!meta?.["x-docsis-validValues"]) return;

        const validValues = meta["x-docsis-validValues"];
        const strValue = String(value);

        if (validValues[strValue] !== undefined) return;

        // Value is not in validValues — create a warning marker
        const startPos = model.getPositionAt(offset);
        const endPos = model.getPositionAt(offset + length);

        const allowed = Object.entries(validValues)
          .map(([k, v]) => `${k} (${v})`)
          .join(", ");

        markers.push({
          severity: monaco.MarkerSeverity.Warning,
          message: `Value ${strValue} is not a recognized value for ${pathParts[pathParts.length - 1]}. Valid values: ${allowed}`,
          startLineNumber: startPos.lineNumber,
          startColumn: startPos.column,
          endLineNumber: endPos.lineNumber,
          endColumn: endPos.column,
        });
      },
    });

    monaco.editor.setModelMarkers(model, MARKER_OWNER, markers);
  }

  // Run on initial load and on every content change
  validate();
  const disposable = editor.onDidChangeModelContent(() => validate());

  return {
    dispose() {
      disposable.dispose();
      const model = editor.getModel();
      if (model) {
        monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
      }
    },
  };
}
