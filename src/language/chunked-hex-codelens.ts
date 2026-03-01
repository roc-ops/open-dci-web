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
import { pickFirmwareFile } from "../file/pick-firmware";
import { showCvcExtractResult, type CvcFieldInfo } from "../ui/cvc-extract-result";
import { showCertificateDetails } from "../ui/certificate-details";
import { parseCertificateHex } from "../codec/certificate-parser";
import { extractCVC, isReady } from "../codec/index";
import { showToast } from "../ui/toast";
import { detectIndentOfRootObject } from "./helpers";

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

/** The subset of chunked properties that are CVC certificates extractable from firmware. */
const CVC_PROPERTIES = new Set([
  "ManufacturerCvc",
  "CoSignerCvc",
  "ManufacturerCvcChain",
  "CoSignerCvcChain",
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
}

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

/**
 * Parse the editor text and return all top-level chunked TLV properties found.
 */
export function findChunkedProperties(text: string): ChunkedProperty[] {
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

/** A top-level string property found in the JSON document. */
interface StringProperty {
  /** AST node for the entire property (key + value). */
  propertyNode: Node;
  /** AST node for the value (the string). */
  valueNode: Node;
  /** The current string value. */
  value: string;
}

/**
 * Find a single top-level string property by name in the document.
 * Returns `null` if the property is not found or is not a string.
 */
function findStringProperty(text: string, propertyName: string): StringProperty | null {
  const root = parseTree(text, undefined, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (!root || root.type !== "object" || !root.children) return null;

  for (const prop of root.children) {
    if (prop.type !== "property" || !prop.children || prop.children.length < 2)
      continue;

    const keyNode = prop.children[0];
    const valueNode = prop.children[1];

    if (
      keyNode.type === "string" &&
      keyNode.value === propertyName &&
      valueNode.type === "string"
    ) {
      return {
        propertyNode: prop,
        valueNode,
        value: valueNode.value ?? "",
      };
    }
  }

  return null;
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
            if (!data.propertyName) return;
            // Re-parse to get fresh offsets (document may have changed since CodeLens creation)
            const model = editor.getModel();
            if (!model) return;
            const prop = findChunkedProperties(model.getValue()).find(
              (p) => p.name === data.propertyName,
            );
            if (!prop) return;
            updateChunkedProperty(
              editor,
              prop.valueNode.offset,
              prop.valueNode.length,
              hexValue,
            );
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

  // Allocate a second command for CVC extraction from firmware.
  const extractCommandId = editor.addCommand(
    0,
    async () => {
      if (!isReady()) {
        showToast("The codec is still loading. Please wait a moment.", "info");
        return;
      }

      let firmwareData: Uint8Array;
      let firmwareName: string;
      try {
        const picked = await pickFirmwareFile();
        firmwareData = picked.data;
        firmwareName = picked.name;
      } catch {
        // User cancelled the file picker — silently ignore.
        return;
      }

      try {
        const result = extractCVC(firmwareData);

        // Drop chain fields that contain only a single certificate —
        // they duplicate the corresponding CVC field.
        if (result.ManufacturerCvcChain) {
          const certs = parseCertificateHex(result.ManufacturerCvcChain);
          if (certs.length <= 1) result.ManufacturerCvcChain = "";
        }
        if (result.CoSignerCvcChain) {
          const certs = parseCertificateHex(result.CoSignerCvcChain);
          if (certs.length <= 1) result.CoSignerCvcChain = "";
        }

        // Check if any certificates were found
        const hasAny =
          result.ManufacturerCvc ||
          result.CoSignerCvc ||
          result.ManufacturerCvcChain ||
          result.CoSignerCvcChain;

        if (!hasAny) {
          // No CVCs found — still set SwUpgradeFilename with the firmware name
          applyCvcExtraction(editor, [], firmwareName);
          showToast("No CVC certificates were found in the selected firmware file. SwUpgradeFilename has been set.", "info");
          return;
        }

        // Determine which properties already exist in the document
        const model = editor.getModel();
        if (!model) return;
        const text = model.getValue();
        const existingProps = findChunkedProperties(text);
        const existingNames = new Set(existingProps.map((p) => p.name));

        // Show confirmation modal
        showCvcExtractResult(container, {
          result,
          existingNames,
          firmwareFilename: firmwareName,
          onApply: (fields, filename) => {
            applyCvcExtraction(editor, fields, filename);
          },
        });
      } catch (err) {
        console.error("CVC extraction error:", err);
        showToast("The selected file does not appear to be a valid signed firmware image.", "error");
      }
    },
  );

  if (extractCommandId === null) {
    return { dispose() {} };
  }

  // Allocate a third command for showing certificate details.
  const showDetailsCommandId = editor.addCommand(
    0,
    (_ctx, data: { propertyName: string; hexValue: string }) => {
      try {
        const certs = parseCertificateHex(data.hexValue);
        showCertificateDetails(container, {
          propertyName: data.propertyName,
          certificates: certs,
        });
      } catch (err) {
        console.error("Certificate parse error:", err);
        showToast("Could not parse the certificate data.", "error");
      }
    },
  );

  if (showDetailsCommandId === null) {
    return { dispose() {} };
  }

  const provider = monaco.languages.registerCodeLensProvider("json", {
    provideCodeLenses(model) {
      const text = model.getValue();
      const existing = findChunkedProperties(text);
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
              } as CodeLensCommandData,
            ],
          },
        });

        // "Extract from Firmware" and "Show Details" lenses on CVC-specific properties
        if (CVC_PROPERTIES.has(prop.name)) {
          lenses.push({
            range: new monaco.Range(pos.lineNumber, 1, pos.lineNumber, 1),
            command: {
              id: extractCommandId,
              title: "Extract from Firmware",
            },
          });

          // Only show "Show Details" when the property has a non-empty hex value
          if (prop.value) {
            lenses.push({
              range: new monaco.Range(pos.lineNumber, 1, pos.lineNumber, 1),
              command: {
                id: showDetailsCommandId,
                title: "\u2139 Show Certificate Details",
                arguments: [
                  {
                    propertyName: prop.name,
                    hexValue: prop.value,
                  },
                ],
              },
            });
          }
        }
      }

      // "Extract from Firmware" lens on SwUpgradeFilename (top-level string property)
      const swUpgrade = findStringProperty(text, "SwUpgradeFilename");
      if (swUpgrade) {
        const pos = model.getPositionAt(swUpgrade.propertyNode.offset);
        lenses.push({
          range: new monaco.Range(pos.lineNumber, 1, pos.lineNumber, 1),
          command: {
            id: extractCommandId,
            title: "Extract from Firmware",
          },
        });
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
 * Insert a new property into the root object.
 *
 * When `afterPropertyName` is given and that property exists, the new
 * property is inserted immediately after it (for logical grouping).
 * Otherwise the new property is appended before the closing `}`.
 */
function insertChunkedProperty(
  editor: monaco.editor.IStandaloneCodeEditor,
  name: string,
  value: string,
  afterPropertyName?: string,
): void {
  const model = editor.getModel();
  if (!model) return;

  const text = model.getValue();
  const root = findRootObject(text);
  if (!root || !root.children) return;

  const indent = detectIndentOfRootObject(model, root);
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
    return;
  }

  // Determine which property to insert after.
  let anchorProp: Node | undefined;
  if (afterPropertyName) {
    for (const prop of root.children) {
      if (
        prop.type === "property" &&
        prop.children &&
        prop.children[0]?.type === "string" &&
        prop.children[0].value === afterPropertyName
      ) {
        anchorProp = prop;
        break;
      }
    }
  }

  // Fall back to last property when no anchor found.
  const targetProp = anchorProp ?? root.children[root.children.length - 1];
  const targetEnd = targetProp.offset + targetProp.length;
  const targetEndPos = model.getPositionAt(targetEnd);

  // Comma logic depends on whether we're inserting at the end or in the middle.
  // Mid-object: the anchor already has a trailing comma (separating it from the
  // next property), so we always need a NEW comma between the anchor and our
  // inserted property — the existing comma stays between our property and the
  // next one.  End-of-object: only add a comma if there isn't a trailing one.
  const isLast = targetProp === root.children[root.children.length - 1];
  let commaPrefix: string;
  if (isLast) {
    const afterTarget = text.substring(targetEnd, targetEnd + 20);
    commaPrefix = /^\s*,/.test(afterTarget) ? "" : ",";
  } else {
    commaPrefix = ",";
  }
  const insertText = `${commaPrefix}\n${newPropText}`;

  model.applyEdits([
    {
      range: new monaco.Range(
        targetEndPos.lineNumber,
        targetEndPos.column,
        targetEndPos.lineNumber,
        targetEndPos.column,
      ),
      text: insertText,
    },
  ]);
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

// ---------------------------------------------------------------------------
// CVC extraction apply
// ---------------------------------------------------------------------------

/**
 * Apply extracted CVC certificate fields to the editor document.
 *
 * For fields that already exist, their values are batch-updated via a single
 * applyEdits call.  New fields are then inserted sequentially (each insertion
 * changes offsets, so we re-parse between inserts).
 *
 * When `firmwareFilename` is provided, also sets (or inserts)
 * the `SwUpgradeFilename` property to the firmware's original filename.
 */
function applyCvcExtraction(
  editor: monaco.editor.IStandaloneCodeEditor,
  fields: CvcFieldInfo[],
  firmwareFilename?: string,
): void {
  const model = editor.getModel();
  if (!model) return;

  // --- Phase 1: batch-update existing CVC fields ---
  const text = model.getValue();
  const existingProps = findChunkedProperties(text);
  const propByName = new Map(existingProps.map((p) => [p.name, p]));

  const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];
  const fieldsToInsert: CvcFieldInfo[] = [];

  for (const field of fields) {
    const existing = propByName.get(field.name);
    if (existing) {
      const startPos = model.getPositionAt(existing.valueNode.offset);
      const endPos = model.getPositionAt(
        existing.valueNode.offset + existing.valueNode.length,
      );
      edits.push({
        range: new monaco.Range(
          startPos.lineNumber,
          startPos.column,
          endPos.lineNumber,
          endPos.column,
        ),
        text: `"${field.hexValue}"`,
      });
    } else {
      fieldsToInsert.push(field);
    }
  }

  // Also batch-update SwUpgradeFilename if it already exists
  if (firmwareFilename) {
    const swUpgrade = findStringProperty(text, "SwUpgradeFilename");
    if (swUpgrade) {
      const startPos = model.getPositionAt(swUpgrade.valueNode.offset);
      const endPos = model.getPositionAt(
        swUpgrade.valueNode.offset + swUpgrade.valueNode.length,
      );
      edits.push({
        range: new monaco.Range(
          startPos.lineNumber,
          startPos.column,
          endPos.lineNumber,
          endPos.column,
        ),
        text: `"${firmwareFilename}"`,
      });
    }
  }

  if (edits.length > 0) {
    model.applyEdits(edits);
  }

  // --- Phase 2: sequentially insert new CVC fields ---
  // Each insertion changes document offsets, so we insert one at a time.
  // Fields are inserted near their logical group: chains after their CVC,
  // CVCs after SwUpgradeFilename or the previous CVC group.
  const INSERT_AFTER: Record<string, string[]> = {
    ManufacturerCvc: ["SwUpgradeFilename"],
    ManufacturerCvcChain: ["ManufacturerCvc"],
    CoSignerCvc: ["ManufacturerCvcChain", "ManufacturerCvc", "SwUpgradeFilename"],
    CoSignerCvcChain: ["CoSignerCvc"],
  };
  for (const field of fieldsToInsert) {
    const candidates = INSERT_AFTER[field.name];
    let anchor: string | undefined;
    if (candidates) {
      // Re-read document each time (previous inserts changed offsets).
      const currentText = model.getValue();
      for (const candidate of candidates) {
        // Check both chunked properties and regular string properties.
        if (findChunkedProperties(currentText).some((p) => p.name === candidate)) {
          anchor = candidate;
          break;
        }
        if (findStringProperty(currentText, candidate)) {
          anchor = candidate;
          break;
        }
      }
    }
    insertChunkedProperty(editor, field.name, field.hexValue, anchor);
  }

  // --- Phase 3: insert SwUpgradeFilename if it didn't already exist ---
  if (firmwareFilename) {
    // Re-check after edits — it may have been inserted above or already existed.
    const updatedText = model.getValue();
    const swUpgrade = findStringProperty(updatedText, "SwUpgradeFilename");
    if (!swUpgrade) {
      insertChunkedProperty(editor, "SwUpgradeFilename", firmwareFilename);
    }
  }
}
