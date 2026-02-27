/**
 * Property completion provider — inserts the correct default value
 * ({}, [], number, or string) when completing a property key based on
 * the JSON Schema type of that property.
 *
 * Monaco's built-in JSON completion always inserts "" for every property
 * value.  This provider replaces that behaviour by walking the DOCSIS
 * config schema to determine the effective type of each candidate
 * property and emitting a snippet with the right structure.
 */
import * as monaco from "monaco-editor";
import { getLocation, parseTree, findNodeAtOffset, Node } from "jsonc-parser";
import { getSchema } from "../schema/loader";

// ---------------------------------------------------------------------------
// Schema helpers (local — kept separate from metadata.ts so the provider
// is self-contained and only depends on the raw schema object)
// ---------------------------------------------------------------------------

type SchemaNode = Record<string, unknown>;

/** Resolves a `#/$defs/Foo` JSON-pointer within the schema root. */
function resolveRef(
  root: SchemaNode,
  ref: string,
): SchemaNode | undefined {
  if (!ref.startsWith("#/")) return undefined;
  const parts = ref.slice(2).split("/");
  let current: unknown = root;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as SchemaNode)[part];
  }
  return current as SchemaNode | undefined;
}

/** Follow a single `$ref` if the node has one, otherwise return the node. */
function resolveNode(root: SchemaNode, node: SchemaNode): SchemaNode {
  if (typeof node["$ref"] === "string") {
    const resolved = resolveRef(root, node["$ref"] as string);
    if (resolved) return resolved;
  }
  return node;
}

/**
 * Determine the effective type string for a property schema node.
 *
 * Rules (matching the request spec):
 *  - `$ref` pointing to a definition whose `type` is `"object"` -> "object"
 *  - `type: "array"`                                             -> "array"
 *  - `type: "integer"` or `type: "number"`                       -> "number"
 *  - `type: "string"`                                            -> "string"
 *  - anything else                                                -> "string"
 */
function effectiveType(root: SchemaNode, propNode: SchemaNode): string {
  // If the node has a direct $ref, resolve it and check its type
  if (typeof propNode["$ref"] === "string") {
    const resolved = resolveRef(root, propNode["$ref"] as string);
    if (resolved) {
      const resolvedType = resolved["type"];
      if (resolvedType === "object") return "object";
      if (resolvedType === "array") return "array";
      if (resolvedType === "integer" || resolvedType === "number")
        return "number";
      if (resolvedType === "string") return "string";
    }
  }

  // Direct type on the node itself
  const directType = propNode["type"];
  if (directType === "array") return "array";
  if (directType === "integer" || directType === "number") return "number";
  if (directType === "string") return "string";
  if (directType === "object") return "object";

  return "string";
}

// ---------------------------------------------------------------------------
// Schema path resolution — walk from root using the JSON-path segments
// ---------------------------------------------------------------------------

/**
 * Given a JSON path (array of string keys, with numeric indices for arrays),
 * resolve the schema node that describes the *container* at that path.
 *
 * Returns the resolved schema node whose `properties` describe the valid
 * keys at the cursor position, or `undefined` if we cannot resolve it.
 */
function resolveSchemaContainer(
  root: SchemaNode,
  pathSegments: (string | number)[],
): SchemaNode | undefined {
  let current: SchemaNode = root;

  for (const segment of pathSegments) {
    current = resolveNode(root, current);

    // If current is array type, dive into items (skipping numeric indices)
    if (current["type"] === "array" && current["items"]) {
      current = resolveNode(
        root,
        current["items"] as SchemaNode,
      );
    }

    if (typeof segment === "number") {
      // Numeric index inside an array — schema stays at the items level
      continue;
    }

    // String key — look in properties
    const props = current["properties"] as SchemaNode | undefined;
    if (!props) return undefined;

    const next = props[segment] as SchemaNode | undefined;
    if (!next) return undefined;

    current = next;
  }

  // Final resolution — if it's a $ref or array, resolve down
  current = resolveNode(root, current);
  if (current["type"] === "array" && current["items"]) {
    current = resolveNode(root, current["items"] as SchemaNode);
  }

  return current;
}

// ---------------------------------------------------------------------------
// Existing-property detection via jsonc-parser AST
// ---------------------------------------------------------------------------

/**
 * Returns the set of property names that already exist in the object
 * the cursor is inside.  Uses the AST from `parseTree()` so we handle
 * comments / trailing commas gracefully.
 */
function existingPropertyNames(
  text: string,
  offset: number,
): Set<string> {
  const names = new Set<string>();
  const tree = parseTree(text, undefined, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (!tree) return names;

  // Find the node at offset, then walk up to find the enclosing object
  const nodeAtCursor = findNodeAtOffset(tree, offset, true);
  if (!nodeAtCursor) return names;

  let objectNode: Node | undefined;

  // Walk up to find the nearest object node
  let candidate: Node | undefined = nodeAtCursor;
  while (candidate) {
    if (candidate.type === "object") {
      objectNode = candidate;
      break;
    }
    candidate = candidate.parent;
  }

  if (!objectNode || !objectNode.children) return names;

  // Each child of an object node is a "property" node with two children:
  // [0] = key (string), [1] = value
  for (const prop of objectNode.children) {
    if (prop.type === "property" && prop.children && prop.children.length >= 1) {
      const keyNode = prop.children[0];
      if (keyNode.type === "string" && keyNode.value != null) {
        names.add(String(keyNode.value));
      }
    }
  }

  return names;
}

// ---------------------------------------------------------------------------
// Range computation — figure out what text to replace
// ---------------------------------------------------------------------------

/**
 * Computes the Monaco Range that should be replaced by our completion.
 *
 * When the user starts typing a property key (possibly inside quotes),
 * we want to replace from the opening `"` through the cursor (or the
 * closing `"` and `: <value>` if they exist).
 */
function computeReplacementRange(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
): monaco.Range {
  const lineContent = model.getLineContent(position.lineNumber);
  const lineOffset = position.column - 1; // 0-based index into lineContent

  // Scan backwards to find the start of the key (opening quote or word start)
  let startCol = position.column;
  for (let i = lineOffset - 1; i >= 0; i--) {
    const ch = lineContent[i];
    if (ch === '"') {
      startCol = i + 1; // 1-based column of the '"'
      break;
    }
    if (ch === "," || ch === "{" || ch === "\n") {
      // Hit a structural character — start is just after it (skip whitespace)
      startCol = i + 2; // 1-based column after the character
      break;
    }
    if (/\s/.test(ch) && i === lineOffset - 1) {
      // Cursor is right after whitespace with nothing typed
      startCol = position.column;
      break;
    }
  }

  // Scan forwards from cursor to find the end of any existing key: "value" pair
  let endCol = position.column;
  for (let i = lineOffset; i < lineContent.length; i++) {
    const ch = lineContent[i];
    if (ch === "," || ch === "}" || ch === "\n") {
      endCol = i + 1; // 1-based column of the delimiter
      break;
    }
    if (i === lineContent.length - 1) {
      endCol = i + 2; // past end of line
      break;
    }
  }

  return new monaco.Range(
    position.lineNumber,
    startCol,
    position.lineNumber,
    endCol,
  );
}

// ---------------------------------------------------------------------------
// Trailing-comma detection
// ---------------------------------------------------------------------------

/**
 * Returns true if a completion inserted at `range` needs a trailing comma.
 *
 * Scans forward from the end of the replacement range to find the first
 * non-whitespace character.  If it's a closing delimiter (`}`, `]`) or an
 * existing comma, no trailing comma is needed.  Anything else (e.g. another
 * `"` starting a property key) means we need to add one.
 */
function needsTrailingComma(
  model: monaco.editor.ITextModel,
  range: monaco.Range,
): boolean {
  const endOffset = model.getOffsetAt(
    new monaco.Position(range.endLineNumber, range.endColumn),
  );
  const text = model.getValue();

  for (let i = endOffset; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) continue;
    return ch !== "}" && ch !== "]" && ch !== ",";
  }

  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Registers a CompletionItemProvider that provides property-key completions
 * with the correct default value based on the schema type.
 */
export function registerPropertyCompletionProvider(): monaco.IDisposable {
  const schema = getSchema();

  return monaco.languages.registerCompletionItemProvider("json", {
    triggerCharacters: ['"', ",", "\n", "{"],

    provideCompletionItems(
      model: monaco.editor.ITextModel,
      position: monaco.Position,
    ): monaco.languages.CompletionList | null {
      const text = model.getValue();
      const offset = model.getOffsetAt(position);
      const location = getLocation(text, offset);

      // Only provide completions at property-key positions
      if (!location.isAtPropertyKey) return null;

      // Build the parent path — the path segments *above* the key being typed.
      // `location.path` includes the partial key itself as the last segment
      // when isAtPropertyKey is true, so we take everything except the last.
      const parentPath = location.path.slice(0, -1);

      // Resolve the schema container for this parent path
      const container = resolveSchemaContainer(schema, parentPath);
      if (!container) return null;

      const properties = container["properties"] as SchemaNode | undefined;
      if (!properties) return null;

      // Determine which properties already exist
      const existing = existingPropertyNames(text, offset);

      // Build the replacement range
      const range = computeReplacementRange(model, position);

      // Determine if a trailing comma is needed — check what follows the
      // replacement range.  If the next non-whitespace character is another
      // property key (or any content that isn't a closing delimiter / comma),
      // we need to append a comma so the JSON stays valid.
      const comma = needsTrailingComma(model, range) ? "," : "";

      const suggestions: monaco.languages.CompletionItem[] = [];
      let sortIndex = 0;

      for (const [propName, propSchema] of Object.entries(properties)) {
        if (!propSchema || typeof propSchema !== "object") continue;
        if (existing.has(propName)) continue;

        const propNode = propSchema as SchemaNode;
        const type = effectiveType(schema, propNode);

        // Determine description
        const description =
          (propNode["description"] as string | undefined) ?? "";

        // Build the snippet insertText
        let insertText: string;
        let detail: string;

        switch (type) {
          case "object":
            insertText = `"${propName}": {\n\t$0\n}${comma}`;
            detail = "object";
            break;
          case "array":
            insertText = `"${propName}": [\n\t{\n\t\t$0\n\t}\n]${comma}`;
            detail = "array";
            break;
          case "number":
            insertText = `"${propName}": $1${comma}`;
            detail = "integer";
            break;
          default:
            // string
            insertText = `"${propName}": "$1"${comma}`;
            detail = "string";
            break;
        }

        suggestions.push({
          label: propName,
          kind: monaco.languages.CompletionItemKind.Property,
          insertText,
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail,
          documentation: description
            ? { value: description }
            : undefined,
          range,
          sortText: `0_${String(sortIndex).padStart(4, "0")}`,
          filterText: propName,
        });

        sortIndex++;
      }

      if (suggestions.length === 0) return null;

      return { suggestions };
    },
  });
}
