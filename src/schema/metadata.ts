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
  "x-docsis-range"?: string | { min?: number; max?: number; maxLength?: number };
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
  if (node["x-docsis-range"] !== undefined) meta["x-docsis-range"] = node["x-docsis-range"] as DocsisFieldMeta["x-docsis-range"];
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
    meta["x-docsis-default"] !== undefined ||
    meta["x-docsis-range"]
  );
}

/**
 * Extracts metadata from a node that may have a $ref with inline annotations.
 * Inline annotations take priority over the resolved $ref target.
 */
function extractMergedMeta(root: SchemaNode, node: SchemaNode, resolved: SchemaNode): DocsisFieldMeta {
  if (resolved === node) return extractMeta(node);
  const base = extractMeta(resolved);
  const inline = extractMeta(node);
  // Overlay inline annotations onto resolved base
  const merged = { ...base };
  for (const [key, val] of Object.entries(inline) as [keyof DocsisFieldMeta, unknown][]) {
    if (val !== undefined) (merged as Record<string, unknown>)[key] = val;
  }
  return merged;
}

/**
 * Computes the absolute TLV path by combining a parent's absolute TLV
 * with a child's (possibly relative) TLV type.
 *
 * Handles multi-segment overlapping prefixes:
 *   parent "24.43" + child "43.5"   → "24.43.5"   (1-segment overlap)
 *   parent "24.43.5" + child "43.5.1" → "24.43.5.1" (2-segment overlap)
 */
function computeAbsoluteTlv(parentAbsTlv: string | undefined, relTlv: string | number): string {
  const rel = String(relTlv);
  if (!parentAbsTlv) return rel;

  // Try progressively shorter suffixes of the parent path (longest first)
  const parentParts = parentAbsTlv.split(".");
  for (let i = 0; i < parentParts.length; i++) {
    const suffix = parentParts.slice(i).join(".");
    if (rel.startsWith(suffix + ".")) {
      return parentAbsTlv + rel.slice(suffix.length);
    }
  }

  // No overlap — append as a sub-TLV
  return parentAbsTlv + "." + rel;
}

/**
 * Builds a metadata index from the JSON Schema.
 * Keys are dot-separated JSON paths (e.g., "ServiceFlowDown.MaxSustainedRate").
 */
export function buildMetadataIndex(schema: SchemaNode): Map<string, DocsisFieldMeta> {
  const index = new Map<string, DocsisFieldMeta>();

  function walk(node: SchemaNode, path: string, parentAbsTlv?: string): void {
    const resolved = resolveNode(schema, node);
    const meta = extractMergedMeta(schema, node, resolved);

    // Compute absolute TLV path
    let absT = parentAbsTlv;
    if (meta["x-docsis-tlvType"] != null) {
      absT = computeAbsoluteTlv(parentAbsTlv, meta["x-docsis-tlvType"]);
      meta["x-docsis-tlvType"] = absT;
    }

    if (path && hasDocsisData(meta)) {
      index.set(path, meta);
    }

    // Walk properties
    const props = resolved["properties"] as SchemaNode | undefined;
    if (props && typeof props === "object") {
      for (const [key, value] of Object.entries(props)) {
        if (value && typeof value === "object") {
          walk(value as SchemaNode, path ? `${path}.${key}` : key, absT);
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
            walk(value as SchemaNode, path ? `${path}.${key}` : key, absT);
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
