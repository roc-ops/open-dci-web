/**
 * Document symbol provider — provides breadcrumb navigation and outline
 * for DOCSIS JSON config files by parsing the JSON AST and building a
 * nested symbol tree.
 */
import * as monaco from "monaco-editor";
import { parseTree, type Node } from "jsonc-parser";

/**
 * Converts a jsonc-parser offset into a Monaco IRange of zero width
 * (a position), using the model to map offsets to line/column.
 */
function offsetToPosition(
  model: monaco.editor.ITextModel,
  offset: number,
): monaco.IPosition {
  return model.getPositionAt(offset);
}

/**
 * Builds an IRange spanning from `startOffset` to `endOffset`.
 */
function offsetRange(
  model: monaco.editor.ITextModel,
  startOffset: number,
  endOffset: number,
): monaco.IRange {
  const start = offsetToPosition(model, startOffset);
  const end = offsetToPosition(model, endOffset);
  return {
    startLineNumber: start.lineNumber,
    startColumn: start.column,
    endLineNumber: end.lineNumber,
    endColumn: end.column,
  };
}

/**
 * Determines the SymbolKind for a jsonc-parser Node based on its type.
 */
function symbolKindForNode(node: Node): monaco.languages.SymbolKind {
  switch (node.type) {
    case "object":
      return monaco.languages.SymbolKind.Object;
    case "array":
      return monaco.languages.SymbolKind.Array;
    default:
      return monaco.languages.SymbolKind.Property;
  }
}

/**
 * Recursively builds DocumentSymbol children for an object node.
 * Each property of the object becomes a symbol with the property key as name.
 */
function buildObjectSymbols(
  model: monaco.editor.ITextModel,
  objectNode: Node,
): monaco.languages.DocumentSymbol[] {
  const symbols: monaco.languages.DocumentSymbol[] = [];
  if (!objectNode.children) return symbols;

  for (const propertyNode of objectNode.children) {
    if (propertyNode.type !== "property" || !propertyNode.children || propertyNode.children.length < 2) {
      continue;
    }

    const keyNode = propertyNode.children[0];
    const valueNode = propertyNode.children[1];
    const name = String(keyNode.value ?? "");

    // range = full property span (key + value)
    const range = offsetRange(
      model,
      propertyNode.offset,
      propertyNode.offset + propertyNode.length,
    );

    // selectionRange = just the key
    const selectionRange = offsetRange(
      model,
      keyNode.offset,
      keyNode.offset + keyNode.length,
    );

    const kind = symbolKindForNode(valueNode);
    const children = buildChildSymbols(model, valueNode);

    symbols.push({
      name,
      detail: "",
      kind,
      tags: [],
      range,
      selectionRange,
      children: children.length > 0 ? children : undefined,
    });
  }

  return symbols;
}

/**
 * Recursively builds DocumentSymbol children for an array node.
 * Each element of the array becomes a symbol named `[0]`, `[1]`, etc.
 */
function buildArraySymbols(
  model: monaco.editor.ITextModel,
  arrayNode: Node,
): monaco.languages.DocumentSymbol[] {
  const symbols: monaco.languages.DocumentSymbol[] = [];
  if (!arrayNode.children) return symbols;

  for (let i = 0; i < arrayNode.children.length; i++) {
    const elementNode = arrayNode.children[i];
    const name = `[${i}]`;

    const range = offsetRange(
      model,
      elementNode.offset,
      elementNode.offset + elementNode.length,
    );

    // selectionRange is the same as range for array elements
    // (there is no separate "key" to select)
    const selectionRange = range;

    const kind = symbolKindForNode(elementNode);
    const children = buildChildSymbols(model, elementNode);

    symbols.push({
      name,
      detail: "",
      kind,
      tags: [],
      range,
      selectionRange,
      children: children.length > 0 ? children : undefined,
    });
  }

  return symbols;
}

/**
 * Dispatches to the appropriate builder based on the node type.
 */
function buildChildSymbols(
  model: monaco.editor.ITextModel,
  node: Node,
): monaco.languages.DocumentSymbol[] {
  if (node.type === "object") {
    return buildObjectSymbols(model, node);
  }
  if (node.type === "array") {
    return buildArraySymbols(model, node);
  }
  return [];
}

/**
 * Registers a DocumentSymbolProvider for the "json" language with Monaco.
 * This enables the built-in breadcrumb navigation bar and outline view.
 */
export function registerDocumentSymbolProvider(): monaco.IDisposable {
  return monaco.languages.registerDocumentSymbolProvider("json", {
    displayName: "DOCSIS JSON Symbols",

    provideDocumentSymbols(
      model: monaco.editor.ITextModel,
    ): monaco.languages.DocumentSymbol[] {
      const text = model.getValue();
      const tree = parseTree(text, undefined, {
        allowTrailingComma: true,
        disallowComments: false,
      });

      if (!tree) return [];

      return buildChildSymbols(model, tree);
    },
  });
}
