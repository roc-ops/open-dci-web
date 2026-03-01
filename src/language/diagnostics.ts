/**
 * Custom diagnostics — DOCSIS-specific validation beyond JSON Schema.
 *
 * Monaco's built-in JSON Schema validation handles structural and type
 * checking. This module adds DOCSIS-specific rules:
 * - x-docsis-validValues checking (warns when value is not in the set)
 * - x-docsis-range checking (warns when value is outside the allowed range)
 */
import * as monaco from "monaco-editor";
import { visit, parseTree, Node } from "jsonc-parser";
import type { DocsisFieldMeta } from "../schema/metadata";
import { buildDotPath } from "./helpers";

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
 * Check for duplicate property keys within the same object.
 * JSONC/JSON5 technically allows duplicates, but DOCSIS configs should not.
 */
function checkDuplicateKeys(
  text: string,
  model: monaco.editor.ITextModel,
  markers: monaco.editor.IMarkerData[],
): void {
  const tree = parseTree(text, undefined, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (!tree) return;

  function walkObject(node: Node): void {
    if (node.type !== "object" || !node.children) return;

    const seen = new Map<string, Node>();
    for (const prop of node.children) {
      if (prop.type !== "property" || !prop.children || prop.children.length < 1) continue;
      const keyNode = prop.children[0];
      if (keyNode.type !== "string" || keyNode.value == null) continue;

      const key = String(keyNode.value);
      if (seen.has(key)) {
        const startPos = model.getPositionAt(keyNode.offset);
        const endPos = model.getPositionAt(keyNode.offset + keyNode.length);
        markers.push({
          severity: monaco.MarkerSeverity.Warning,
          message: `Duplicate property "${key}" — only the last value will be used.`,
          startLineNumber: startPos.lineNumber,
          startColumn: startPos.column,
          endLineNumber: endPos.lineNumber,
          endColumn: endPos.column,
        });
      } else {
        seen.set(key, keyNode);
      }
    }

    // Recurse into children
    for (const prop of node.children) {
      if (prop.children) {
        for (const child of prop.children) {
          if (child.type === "object" || child.type === "array") walkObject(child);
        }
      }
    }
  }

  // Also walk arrays
  function walkArray(node: Node): void {
    if (node.type !== "array" || !node.children) return;
    for (const child of node.children) {
      if (child.type === "object") walkObject(child);
      else if (child.type === "array") walkArray(child);
    }
  }

  if (tree.type === "object") walkObject(tree);
  else if (tree.type === "array") walkArray(tree);
}

/**
 * Check for duplicate ServiceFlowReference values across all service flows.
 * Each ServiceFlowReference must be unique across the entire config.
 */
function checkDuplicateServiceFlowRefs(
  text: string,
  model: monaco.editor.ITextModel,
  markers: monaco.editor.IMarkerData[],
): void {
  const refs: { value: number; offset: number; length: number; flow: string }[] = [];

  visit(text, {
    onLiteralValue(value, offset, length, _startLine, _startChar, pathSupplier) {
      const path = pathSupplier();
      const lastSeg = path[path.length - 1];
      if (lastSeg !== "ServiceFlowReference") return;
      if (typeof value !== "number") return;

      // Only check ServiceFlowReference inside actual service flow definitions,
      // not inside packet classifiers (which reference existing flows).
      const flowType = path.find(
        (s) => s === "UpstreamServiceFlow" || s === "DownstreamServiceFlow",
      );
      if (typeof flowType !== "string") return;
      refs.push({
        value,
        offset,
        length,
        flow: flowType,
      });
    },
  });

  // Group by value and flag duplicates
  const byValue = new Map<number, typeof refs>();
  for (const ref of refs) {
    const group = byValue.get(ref.value) ?? [];
    group.push(ref);
    byValue.set(ref.value, group);
  }

  for (const [value, group] of byValue) {
    if (group.length <= 1) continue;
    for (const ref of group) {
      const startPos = model.getPositionAt(ref.offset);
      const endPos = model.getPositionAt(ref.offset + ref.length);
      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        message: `Duplicate ServiceFlowReference ${value} — each service flow must have a unique reference number.`,
        startLineNumber: startPos.lineNumber,
        startColumn: startPos.column,
        endLineNumber: endPos.lineNumber,
        endColumn: endPos.column,
      });
    }
  }
}

/**
 * Check for MtaConfigDelimiter presence in MTA configs.
 * If only the start delimiter (1) is present, warn that the end delimiter (255)
 * will be added automatically during encoding. JSON cannot have duplicate keys,
 * so both delimiters can't appear as separate "MtaConfigDelimiter" properties.
 */
function checkMtaDelimiters(
  text: string,
  model: monaco.editor.ITextModel,
  markers: monaco.editor.IMarkerData[],
): void {
  let delimiterValue: number | undefined;
  let delimiterOffset = 0;
  let delimiterLength = 0;

  visit(text, {
    onLiteralValue(value, offset, length, _startLine, _startChar, pathSupplier) {
      const path = pathSupplier();
      if (path.length === 1 && path[0] === "MtaConfigDelimiter" && typeof value === "number") {
        delimiterValue = value;
        delimiterOffset = offset;
        delimiterLength = length;
      }
    },
  });

  if (delimiterValue === undefined) return;

  if (delimiterValue === 1) {
    // Start delimiter present but no end delimiter (can't have duplicate keys in JSON).
    const startPos = model.getPositionAt(delimiterOffset);
    const endPos = model.getPositionAt(delimiterOffset + delimiterLength);
    markers.push({
      severity: monaco.MarkerSeverity.Info,
      message: "MtaConfigDelimiter end marker (255) will be added automatically during encoding.",
      startLineNumber: startPos.lineNumber,
      startColumn: startPos.column,
      endLineNumber: endPos.lineNumber,
      endColumn: endPos.column,
    });
  } else if (delimiterValue === 255) {
    // End delimiter without start — unusual
    const startPos = model.getPositionAt(delimiterOffset);
    const endPos = model.getPositionAt(delimiterOffset + delimiterLength);
    markers.push({
      severity: monaco.MarkerSeverity.Warning,
      message: "MtaConfigDelimiter is set to 255 (end marker). The start marker (1) is expected. Both will be added automatically during encoding.",
      startLineNumber: startPos.lineNumber,
      startColumn: startPos.column,
      endLineNumber: endPos.lineNumber,
      endColumn: endPos.column,
    });
  }
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
        const dotPath = buildDotPath(path);
        if (!dotPath) return;

        const meta = metadataIndex.get(dotPath);
        if (!meta) return;

        const fieldName = dotPath.slice(dotPath.lastIndexOf(".") + 1);

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

    // --- Cross-field: duplicate keys ---
    checkDuplicateKeys(text, model, markers);

    // --- Cross-field: duplicate ServiceFlowReference ---
    checkDuplicateServiceFlowRefs(text, model, markers);

    // --- MTA delimiter check ---
    checkMtaDelimiters(text, model, markers);

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
