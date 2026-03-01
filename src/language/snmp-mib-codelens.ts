/**
 * SNMP MIB CodeLens — inline "Add" and "Edit" buttons on SnmpMibObject
 * arrays in the editor.  Clicking a lens opens the MIB browser modal
 * and writes the result back into the document via model.applyEdits().
 */
import * as monaco from "monaco-editor";
import { parseTree, type Node } from "jsonc-parser";
import { showMibBrowser } from "../ui/mib-browser";
import { resolveName } from "../codec/index";
import { detectIndentAtOffset } from "./helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SnmpEntry {
  node: Node;
  oid: string;
  type: string;
  value: string;
}

interface SnmpMibArray {
  /** The array Node from jsonc-parser. */
  arrayNode: Node;
  /** Parsed entries inside the array. */
  entries: SnmpEntry[];
}

interface CodeLensCommandData {
  mode: "add" | "edit";
  arrayOffset: number;
  arrayLength: number;
  entryIndex?: number;
  existingOid?: string;
  existingType?: string;
  existingValue?: string;
}

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

/**
 * Walk the parse tree and return every SnmpMibObject array found.
 */
function findSnmpMibArrays(text: string): SnmpMibArray[] {
  const root = parseTree(text, undefined, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (!root) return [];

  const results: SnmpMibArray[] = [];
  walkForSnmpMib(root, results);
  return results;
}

function walkForSnmpMib(node: Node, results: SnmpMibArray[]): void {
  if (node.type === "property" && node.children && node.children.length === 2) {
    const keyNode = node.children[0];
    const valueNode = node.children[1];

    if (
      keyNode.type === "string" &&
      keyNode.value === "SnmpMibObject" &&
      valueNode.type === "array"
    ) {
      const entries: SnmpEntry[] = [];
      if (valueNode.children) {
        for (const child of valueNode.children) {
          const entry = extractEntryFields(child);
          if (entry) entries.push(entry);
        }
      }
      results.push({ arrayNode: valueNode, entries });
    }
  }

  // Recurse into children
  if (node.children) {
    for (const child of node.children) {
      walkForSnmpMib(child, results);
    }
  }
}

/**
 * Extract oid, type, value string fields from an object AST node.
 */
function extractEntryFields(node: Node): SnmpEntry | null {
  if (node.type !== "object" || !node.children) return null;

  let oid = "";
  let type = "";
  let value = "";

  for (const prop of node.children) {
    if (prop.type !== "property" || !prop.children || prop.children.length < 2)
      continue;
    const key = prop.children[0];
    const val = prop.children[1];
    if (key.type !== "string") continue;

    switch (key.value) {
      case "oid":
        oid = val.value ?? "";
        break;
      case "type":
        type = val.value ?? "";
        break;
      case "value":
        value = val.value ?? "";
        break;
    }
  }

  return { node, oid, type, value };
}

/**
 * Format a single entry as a JSONC string with the given base indent.
 * `baseIndent` is the whitespace used for the array's containing level
 * (the SnmpMibObject key line).  Each entry is indented one level deeper.
 */
function formatEntry(
  entry: { oid: string; type: string; value: string; oidLabel?: string; enumLabel?: string },
  baseIndent: string,
): string {
  const inner = baseIndent + "  ";
  const oidComment = entry.oidLabel ?? resolveOidName(entry.oid);
  const oidSuffix = oidComment ? ` // ${oidComment}` : "";
  const enumSuffix = entry.enumLabel ? ` // ${entry.enumLabel}` : "";
  return [
    `${inner}{`,
    `${inner}  "oid": "${entry.oid}",${oidSuffix}`,
    `${inner}  "type": "${entry.type}",`,
    `${inner}  "value": "${entry.value}"${enumSuffix}`,
    `${inner}}`,
  ].join("\n");
}

/**
 * Try to resolve a numeric OID to a short name via the codec.
 * Returns the last segment of the dotted name path, or null on failure.
 */
function resolveOidName(oid: string): string | null {
  try {
    const full = resolveName(oid);
    // resolveName returns e.g. "iso.org.dod.internet.mgmt.mib-2.system.sysDescr"
    // We want just the last component.
    const parts = full.split(".");
    return parts[parts.length - 1] ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register CodeLens integration for SnmpMibObject arrays.
 * Returns a disposable that tears down all registrations.
 */
export function registerSnmpMibCodeLens(
  editor: monaco.editor.IStandaloneCodeEditor,
  container: HTMLElement,
): monaco.IDisposable {
  // Allocate a unique command id for opening the MIB browser.
  const commandId = editor.addCommand(
    0,
    (_ctx, data: CodeLensCommandData) => {
      showMibBrowser(container, {
        mode: data.mode,
        existingOid: data.existingOid,
        existingType: data.existingType,
        existingValue: data.existingValue,
        onSave: (entry) => {
          if (data.mode === "add") {
            insertSnmpEntry(editor, data, entry);
          } else {
            updateSnmpEntry(editor, data, entry);
          }
        },
      });
    },
  );

  if (commandId === null) {
    // Shouldn't happen, but guard.
    return { dispose() {} };
  }

  const provider = monaco.languages.registerCodeLensProvider("json", {
    provideCodeLenses(model) {
      const text = model.getValue();
      const arrays = findSnmpMibArrays(text);
      const lenses: monaco.languages.CodeLens[] = [];

      for (const arr of arrays) {
        const arrayOffset = arr.arrayNode.offset;
        const arrayLength = arr.arrayNode.length;

        if (arr.entries.length === 0) {
          // Empty array — single "Add" lens on the array line.
          const pos = model.getPositionAt(arrayOffset);
          lenses.push({
            range: new monaco.Range(
              pos.lineNumber,
              1,
              pos.lineNumber,
              1,
            ),
            command: {
              id: commandId,
              title: "\uff0b Add SNMP MIB Object",
              arguments: [
                {
                  mode: "add",
                  arrayOffset,
                  arrayLength,
                } as CodeLensCommandData,
              ],
            },
          });
        } else {
          // Non-empty array — "Edit" on each entry, "Add" on the closing bracket.
          for (let i = 0; i < arr.entries.length; i++) {
            const entry = arr.entries[i];
            const entryPos = model.getPositionAt(entry.node.offset);

            // Resolve OID to a friendly name for the title
            const oidLabel = resolveOidName(entry.oid) ?? entry.oid;
            const title = `\u270e Edit ${oidLabel}`;

            lenses.push({
              range: new monaco.Range(
                entryPos.lineNumber,
                1,
                entryPos.lineNumber,
                1,
              ),
              command: {
                id: commandId,
                title,
                arguments: [
                  {
                    mode: "edit",
                    arrayOffset,
                    arrayLength,
                    entryIndex: i,
                    existingOid: entry.oid,
                    existingType: entry.type,
                    existingValue: entry.value,
                  } as CodeLensCommandData,
                ],
              },
            });
          }

          // "Add" lens on the closing bracket line
          const closingOffset = arrayOffset + arrayLength - 1;
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
              title: "\uff0b Add SNMP MIB Object",
              arguments: [
                {
                  mode: "add",
                  arrayOffset,
                  arrayLength,
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
 * Insert a new SNMP entry into the SnmpMibObject array.
 */
function insertSnmpEntry(
  editor: monaco.editor.IStandaloneCodeEditor,
  data: CodeLensCommandData,
  entry: { oid: string; type: string; value: string; oidLabel?: string; enumLabel?: string },
): void {
  const model = editor.getModel();
  if (!model) return;

  // Re-parse to get current state (content may have changed)
  const text = model.getValue();
  const arrays = findSnmpMibArrays(text);

  // Find the matching array by offset
  const arr = arrays.find((a) => a.arrayNode.offset === data.arrayOffset);
  if (!arr) return;

  const baseIndent = detectIndentAtOffset(model, arr.arrayNode.offset);
  const formatted = formatEntry(entry, baseIndent);

  if (arr.entries.length === 0) {
    // Replace empty [] with [\n{entry}\n{indent}]
    const startPos = model.getPositionAt(arr.arrayNode.offset);
    const endPos = model.getPositionAt(
      arr.arrayNode.offset + arr.arrayNode.length,
    );
    const replacement = `[\n${formatted}\n${baseIndent}]`;
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
    // Insert after the last entry, adding a comma
    const lastEntry = arr.entries[arr.entries.length - 1];
    const lastEnd = lastEntry.node.offset + lastEntry.node.length;
    const insertPos = model.getPositionAt(lastEnd);
    const insertText = `,\n${formatted}`;
    model.applyEdits([
      {
        range: new monaco.Range(
          insertPos.lineNumber,
          insertPos.column,
          insertPos.lineNumber,
          insertPos.column,
        ),
        text: insertText,
      },
    ]);
  }
}

/**
 * Replace an existing SNMP entry in the SnmpMibObject array.
 */
function updateSnmpEntry(
  editor: monaco.editor.IStandaloneCodeEditor,
  data: CodeLensCommandData,
  entry: { oid: string; type: string; value: string; oidLabel?: string; enumLabel?: string },
): void {
  const model = editor.getModel();
  if (!model) return;

  if (data.entryIndex === undefined) return;

  // Re-parse
  const text = model.getValue();
  const arrays = findSnmpMibArrays(text);

  const arr = arrays.find((a) => a.arrayNode.offset === data.arrayOffset);
  if (!arr) return;

  const target = arr.entries[data.entryIndex];
  if (!target) return;

  const baseIndent = detectIndentAtOffset(model, arr.arrayNode.offset);
  const formatted = formatEntry(entry, baseIndent);

  const startPos = model.getPositionAt(target.node.offset);
  const endPos = model.getPositionAt(target.node.offset + target.node.length);

  model.applyEdits([
    {
      range: new monaco.Range(
        startPos.lineNumber,
        startPos.column,
        endPos.lineNumber,
        endPos.column,
      ),
      text: formatted,
    },
  ]);
}
