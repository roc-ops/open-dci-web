/**
 * Chunked Hex CodeLens — inline "Edit" and "Add" buttons on chunked TLV
 * properties in the editor.  Clicking a lens opens the hex input modal
 * and writes the result back into the document via model.applyEdits().
 *
 * The WASM encoder handles the actual wire chunking — the editor stores
 * the full concatenated hex as a single JSON string value.
 */
import * as monaco from "monaco-editor";
import { parseTree, type Node } from "jsonc-parser";
import { showHexInput } from "../ui/hex-input";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Top-level JSON property names that hold chunked TLV hex values. */
const CHUNKED_PROPERTIES = new Set([
  "ManufacturerCvc",
  "CoSignerCvc",
  "ManufacturerCvcChain",
  "CoSignerCvcChain",
  "Eps",
  "Emta",
  "Estb",
  "Edva",
  "Esg",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChunkedProperty {
  /** The property key name. */
  name: string;
  /** AST node for the entire property (key + value). */
  propertyNode: Node;
  /** AST node for the value (the hex string). */
  valueNode: Node;
  /** The current hex string value. */
  value: string;
}

interface CodeLensCommandData {
  mode: "add" | "edit";
  propertyName?: string;
  existingValue?: string;
  /** Offset of the value node (for edit mode). */
  valueOffset?: number;
  /** Length of the value node (for edit mode). */
  valueLength?: number;
}

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

/**
 * Parse the editor text and return all top-level chunked TLV properties found.
 */
function findChunkedProperties(text: string): ChunkedProperty[] {
  const root = parseTree(text, undefined, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (!root || root.type !== "object" || !root.children) return [];

  const results: ChunkedProperty[] = [];

  for (const prop of root.children) {
    if (prop.type !== "property" || !prop.children || prop.children.length < 2)
      continue;

    const keyNode = prop.children[0];
    const valueNode = prop.children[1];

    if (
      keyNode.type === "string" &&
      CHUNKED_PROPERTIES.has(keyNode.value) &&
      valueNode.type === "string"
    ) {
      results.push({
        name: keyNode.value,
        propertyNode: prop,
        valueNode,
        value: valueNode.value ?? "",
      });
    }
  }

  return results;
}

/**
 * Find the root object node from the parse tree.
 */
function findRootObject(text: string): Node | null {
  const root = parseTree(text, undefined, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (!root || root.type !== "object") return null;
  return root;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register CodeLens integration for chunked TLV hex properties.
 * Returns a disposable that tears down all registrations.
 */
export function registerChunkedHexCodeLens(
  editor: monaco.editor.IStandaloneCodeEditor,
  container: HTMLElement,
): monaco.IDisposable {
  // Allocate a unique command id for opening the hex input modal.
  const commandId = editor.addCommand(
    0,
    (_ctx, data: CodeLensCommandData) => {
      if (data.mode === "edit") {
        showHexInput(container, {
          mode: "edit",
          propertyName: data.propertyName,
          existingValue: data.existingValue,
          onSave: (_name, hexValue) => {
            if (
              data.valueOffset !== undefined &&
              data.valueLength !== undefined
            ) {
              updateChunkedProperty(
                editor,
                data.valueOffset,
                data.valueLength,
                hexValue,
              );
            }
          },
        });
      } else {
        // Add mode — compute available properties
        const model = editor.getModel();
        if (!model) return;
        const text = model.getValue();
        const existing = findChunkedProperties(text);
        const existingNames = new Set(existing.map((p) => p.name));
        const available = [...CHUNKED_PROPERTIES].filter(
          (n) => !existingNames.has(n),
        );

        if (available.length === 0) return;

        showHexInput(container, {
          mode: "add",
          availableProperties: available,
          onSave: (propertyName, hexValue) => {
            insertChunkedProperty(editor, propertyName, hexValue);
          },
        });
      }
    },
  );

  if (commandId === null) {
    return { dispose() {} };
  }

  const provider = monaco.languages.registerCodeLensProvider("json", {
    provideCodeLenses(model) {
      const text = model.getValue();
      const existing = findChunkedProperties(text);
      const root = findRootObject(text);
      const lenses: monaco.languages.CodeLens[] = [];

      // "Edit" lens on each existing chunked property
      for (const prop of existing) {
        const pos = model.getPositionAt(prop.propertyNode.offset);
        lenses.push({
          range: new monaco.Range(pos.lineNumber, 1, pos.lineNumber, 1),
          command: {
            id: commandId,
            title: `\u270e Edit ${prop.name}`,
            arguments: [
              {
                mode: "edit",
                propertyName: prop.name,
                existingValue: prop.value,
                valueOffset: prop.valueNode.offset,
                valueLength: prop.valueNode.length,
              } as CodeLensCommandData,
            ],
          },
        });
      }

      // "Add" lens on the root object's closing brace (if there are missing properties)
      if (root) {
        const existingNames = new Set(existing.map((p) => p.name));
        const hasMissing = [...CHUNKED_PROPERTIES].some(
          (n) => !existingNames.has(n),
        );

        if (hasMissing) {
          const closingOffset = root.offset + root.length - 1;
          const closingPos = model.getPositionAt(closingOffset);
          lenses.push({
            range: new monaco.Range(
              closingPos.lineNumber,
              1,
              closingPos.lineNumber,
              1,
            ),
            command: {
              id: commandId,
              title: "\uff0b Add Chunked TLV",
              arguments: [
                {
                  mode: "add",
                } as CodeLensCommandData,
              ],
            },
          });
        }
      }

      return { lenses, dispose() {} };
    },

    resolveCodeLens(_model, codeLens) {
      return codeLens;
    },
  });

  return provider;
}

// ---------------------------------------------------------------------------
// Edit operations
// ---------------------------------------------------------------------------

/**
 * Detect the base indentation of the root object by looking at the first
 * property's line.
 */
function detectIndent(
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

/**
 * Insert a new chunked property before the root object's closing `}`.
 * Handles comma placement: adds a comma after the last existing property.
 */
function insertChunkedProperty(
  editor: monaco.editor.IStandaloneCodeEditor,
  name: string,
  value: string,
): void {
  const model = editor.getModel();
  if (!model) return;

  const text = model.getValue();
  const root = findRootObject(text);
  if (!root || !root.children) return;

  const indent = detectIndent(model, root);
  const newPropText = `${indent}"${name}": "${value}"`;

  if (root.children.length === 0) {
    // Empty object — replace {} with {\n  "Name": "value"\n}
    const startPos = model.getPositionAt(root.offset);
    const endPos = model.getPositionAt(root.offset + root.length);
    const replacement = `{\n${newPropText}\n}`;
    model.applyEdits([
      {
        range: new monaco.Range(
          startPos.lineNumber,
          startPos.column,
          endPos.lineNumber,
          endPos.column,
        ),
        text: replacement,
      },
    ]);
  } else {
    // Find the last property and add a comma after it, then insert new property
    const lastProp = root.children[root.children.length - 1];
    const lastPropEnd = lastProp.offset + lastProp.length;
    const lastPropEndPos = model.getPositionAt(lastPropEnd);

    // Check if there's already a comma after the last property
    const afterLastProp = text.substring(lastPropEnd, lastPropEnd + 20);
    const hasComma = /^\s*,/.test(afterLastProp);

    // Insert comma (if needed) + newline + new property before the closing }
    const commaPrefix = hasComma ? "" : ",";
    const insertText = `${commaPrefix}\n${newPropText}`;

    model.applyEdits([
      {
        range: new monaco.Range(
          lastPropEndPos.lineNumber,
          lastPropEndPos.column,
          lastPropEndPos.lineNumber,
          lastPropEndPos.column,
        ),
        text: insertText,
      },
    ]);
  }
}

/**
 * Replace an existing chunked property's value in the editor.
 * The valueOffset/valueLength point to the value node (including quotes).
 */
function updateChunkedProperty(
  editor: monaco.editor.IStandaloneCodeEditor,
  valueOffset: number,
  valueLength: number,
  newValue: string,
): void {
  const model = editor.getModel();
  if (!model) return;

  const startPos = model.getPositionAt(valueOffset);
  const endPos = model.getPositionAt(valueOffset + valueLength);

  model.applyEdits([
    {
      range: new monaco.Range(
        startPos.lineNumber,
        startPos.column,
        endPos.lineNumber,
        endPos.column,
      ),
      text: `"${newValue}"`,
    },
  ]);
}
