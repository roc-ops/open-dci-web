/**
 * DOCSIS field metadata — parses x-docsis-* extensions from the JSON Schema
 * and builds an index for hover/completion providers.
 */

/** Metadata for a single DOCSIS configuration field. */
export interface DocsisFieldMeta {
  description?: string;
  "x-docsis-spec"?: string;
  "x-docsis-tlvType"?: string;
  "x-docsis-dataType"?: string;
  "x-docsis-validValues"?: Record<string, string>;
  "x-docsis-default"?: unknown;
  "x-docsis-repeatable"?: boolean;
  "x-docsis-tlvLength"?: string | number;
}

type SchemaNode = Record<string, unknown>;

/**
 * Resolves a $ref pointer within the schema.
 * Handles "#/$defs/Foo" style references.
 */
function resolveRef(schema: SchemaNode, ref: string): SchemaNode | undefined {
  if (!ref.startsWith("#/")) return undefined;
  const parts = ref.slice(2).split("/");
  let current: unknown = schema;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as SchemaNode)[part];
  }
  return current as SchemaNode | undefined;
}

/**
 * Resolves a schema node, following $ref if present.
 */
function resolveNode(root: SchemaNode, node: SchemaNode): SchemaNode {
  if (typeof node["$ref"] === "string") {
    const resolved = resolveRef(root, node["$ref"] as string);
    if (resolved) return resolved;
  }
  return node;
}

/** Extracts DocsisFieldMeta from a schema node. */
function extractMeta(node: SchemaNode): DocsisFieldMeta {
  const meta: DocsisFieldMeta = {};
  if (typeof node["description"] === "string") meta.description = node["description"] as string;
  if (node["x-docsis-spec"] !== undefined) meta["x-docsis-spec"] = node["x-docsis-spec"] as string;
  if (node["x-docsis-tlvType"] !== undefined) meta["x-docsis-tlvType"] = node["x-docsis-tlvType"] as string;
  if (node["x-docsis-dataType"] !== undefined) meta["x-docsis-dataType"] = node["x-docsis-dataType"] as string;
  if (node["x-docsis-validValues"] !== undefined) meta["x-docsis-validValues"] = node["x-docsis-validValues"] as Record<string, string>;
  if (node["x-docsis-default"] !== undefined) meta["x-docsis-default"] = node["x-docsis-default"];
  if (node["x-docsis-repeatable"] !== undefined) meta["x-docsis-repeatable"] = node["x-docsis-repeatable"] as boolean;
  if (node["x-docsis-tlvLength"] !== undefined) meta["x-docsis-tlvLength"] = node["x-docsis-tlvLength"] as string | number;
  return meta;
}

/** Checks if a DocsisFieldMeta has any x-docsis-* data. */
function hasDocsisData(meta: DocsisFieldMeta): boolean {
  return !!(
    meta.description ||
    meta["x-docsis-spec"] ||
    meta["x-docsis-tlvType"] ||
    meta["x-docsis-dataType"] ||
    meta["x-docsis-validValues"] ||
    meta["x-docsis-default"] !== undefined
  );
}

/**
 * Builds a metadata index from the JSON Schema.
 * Keys are dot-separated JSON paths (e.g., "ServiceFlowDown.MaxSustainedRate").
 */
export function buildMetadataIndex(schema: SchemaNode): Map<string, DocsisFieldMeta> {
  const index = new Map<string, DocsisFieldMeta>();

  function walk(node: SchemaNode, path: string): void {
    const resolved = resolveNode(schema, node);
    const meta = extractMeta(resolved);
    if (path && hasDocsisData(meta)) {
      index.set(path, meta);
    }

    // Walk properties
    const props = resolved["properties"] as SchemaNode | undefined;
    if (props && typeof props === "object") {
      for (const [key, value] of Object.entries(props)) {
        if (value && typeof value === "object") {
          walk(value as SchemaNode, path ? `${path}.${key}` : key);
        }
      }
    }

    // Walk array items
    const items = resolved["items"] as SchemaNode | undefined;
    if (items && typeof items === "object") {
      // For arrays, walk into items with the same path prefix
      // (the items define the structure of each array element)
      const itemsResolved = resolveNode(schema, items);
      const itemProps = itemsResolved["properties"] as SchemaNode | undefined;
      if (itemProps && typeof itemProps === "object") {
        for (const [key, value] of Object.entries(itemProps)) {
          if (value && typeof value === "object") {
            walk(value as SchemaNode, path ? `${path}.${key}` : key);
          }
        }
      }
    }
  }

  walk(schema, "");
  return index;
}

/**
 * Resolves the schema node at a given JSON path.
 * Path segments are property names (array indices are skipped).
 */
export function resolveSchemaAtPath(
  schema: SchemaNode,
  pathSegments: string[],
): DocsisFieldMeta | undefined {
  let current = schema;

  for (const segment of pathSegments) {
    current = resolveNode(schema, current);

    // Check if current is an array schema — dive into items
    if (current["type"] === "array" && current["items"]) {
      current = resolveNode(schema, current["items"] as SchemaNode);
    }

    const props = current["properties"] as SchemaNode | undefined;
    if (!props) return undefined;

    const next = props[segment] as SchemaNode | undefined;
    if (!next) return undefined;

    current = next;
  }

  const resolved = resolveNode(schema, current);
  const meta = extractMeta(resolved);
  return hasDocsisData(meta) ? meta : undefined;
}
