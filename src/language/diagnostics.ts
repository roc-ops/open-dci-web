/**
 * Custom diagnostics — DOCSIS-specific validation beyond JSON Schema.
 *
 * Monaco's built-in JSON Schema validation handles structural and type
 * checking. This module adds DOCSIS-specific rules:
 * - x-docsis-validValues checking (warns when value is not in the set)
 * - x-docsis-range checking (warns when value is outside the allowed range)
 */
import * as monaco from "monaco-editor";
import { visit } from "jsonc-parser";
import type { DocsisFieldMeta } from "../schema/metadata";

/** Owner string used to identify our custom markers. */
const MARKER_OWNER = "docsis-custom";

/**
 * Parse an x-docsis-range value into numeric min/max bounds.
 * Handles both string format ("1-6047999") and object format ({ min, max, maxLength }).
 * Returns null if the range doesn't apply to the given value type.
 */
function parseRange(
  range: DocsisFieldMeta["x-docsis-range"],
  value: unknown,
): { min: number; max: number; label: string } | null {
  if (!range) return null;

  if (typeof range === "string") {
    // String format: "min-max"
    const match = range.match(/^(\d+)-(\d+)$/);
    if (!match) return null;
    return {
      min: Number(match[1]),
      max: Number(match[2]),
      label: range,
    };
  }

  // Object format
  if (typeof range === "object") {
    // maxLength applies to string values
    if (range.maxLength !== undefined && typeof value === "string") {
      return {
        min: 0,
        max: range.maxLength,
        label: `max length ${range.maxLength}`,
      };
    }
    // min/max applies to numeric values
    if (typeof value === "number") {
      const min = range.min ?? 0;
      const max = range.max ?? Infinity;
      return { min, max, label: `${min}-${max}` };
    }
  }

  return null;
}

/**
 * Registers custom DOCSIS diagnostics on the given editor.
 * Validates values against x-docsis-validValues and x-docsis-range.
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
        if (!meta) return;

        const fieldName = pathParts[pathParts.length - 1];

        // --- validValues check ---
        if (meta["x-docsis-validValues"]) {
          const validValues = meta["x-docsis-validValues"];
          const strValue = String(value);

          if (validValues[strValue] === undefined) {
            const startPos = model.getPositionAt(offset);
            const endPos = model.getPositionAt(offset + length);

            const allowed = Object.entries(validValues)
              .map(([k, v]) => `${k} (${v})`)
              .join(", ");

            markers.push({
              severity: monaco.MarkerSeverity.Warning,
              message: `Value ${strValue} is not a recognized value for ${fieldName}. Valid values: ${allowed}`,
              startLineNumber: startPos.lineNumber,
              startColumn: startPos.column,
              endLineNumber: endPos.lineNumber,
              endColumn: endPos.column,
            });
            return; // Don't also check range if validValues already flagged
          }
        }

        // --- range check ---
        if (meta["x-docsis-range"]) {
          const bounds = parseRange(meta["x-docsis-range"], value);
          if (bounds) {
            // For string maxLength, check string length
            const isStringLength =
              typeof meta["x-docsis-range"] === "object" &&
              (meta["x-docsis-range"] as { maxLength?: number }).maxLength !== undefined &&
              typeof value === "string";

            const numericValue = isStringLength
              ? (value as string).length
              : typeof value === "number"
                ? value
                : null;

            if (numericValue !== null && (numericValue < bounds.min || numericValue > bounds.max)) {
              const startPos = model.getPositionAt(offset);
              const endPos = model.getPositionAt(offset + length);

              const msg = isStringLength
                ? `String length ${numericValue} exceeds maximum length of ${bounds.max} for ${fieldName}.`
                : `Value ${numericValue} is outside the allowed range ${bounds.label} for ${fieldName}.`;

              markers.push({
                severity: monaco.MarkerSeverity.Warning,
                message: msg,
                startLineNumber: startPos.lineNumber,
                startColumn: startPos.column,
                endLineNumber: endPos.lineNumber,
                endColumn: endPos.column,
              });
            }
          }
        }
      },
    });

    monaco.editor.setModelMarkers(model, MARKER_OWNER, markers);
  }

  // Run on initial load and debounce subsequent content changes (200ms)
  validate();
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const disposable = editor.onDidChangeModelContent(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(validate, 200);
  });

  return {
    dispose() {
      clearTimeout(debounceTimer);
      disposable.dispose();
      const model = editor.getModel();
      if (model) {
        monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
      }
    },
  };
}
