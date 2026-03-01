/**
 * MIB Browser — split-pane modal for browsing loaded MIBs.
 *
 * Left pane (45%) shows a collapsible tree of writable OID leaves.
 * Right pane (55%) shows details and value entry for the selected leaf.
 * Includes search by name or numeric OID.
 */

import { queryMIBTree } from "../codec/index";
import type { MIBTreeNode, IndexObject } from "../codec/index";
import { createModal } from "./modal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DisplayTreeNode {
  oid: string;
  label: string; // collapsed path (e.g., "iso.org.dod")
  isLeaf: boolean;
  source?: MIBTreeNode; // original data for leaves
  collapsedSources?: MIBTreeNode[]; // intermediate nodes merged during collapse
  children: DisplayTreeNode[];
}

export interface MibBrowserOptions {
  mode: "add" | "edit";
  existingOid?: string;
  existingType?: string;
  existingValue?: string;
  onSave: (entry: { oid: string; type: string; value: string; oidLabel?: string; enumLabel?: string }) => void;
}

// ---------------------------------------------------------------------------
// Module-level cache
// ---------------------------------------------------------------------------

let cachedDisplayTree: DisplayTreeNode | null = null;

/** Invalidate the cached display tree (call after MIB load/unload). */
export function invalidateMibBrowserCache(): void {
  cachedDisplayTree = null;
}

// ---------------------------------------------------------------------------
// Tree data processing
// ---------------------------------------------------------------------------

const WRITABLE_ACCESS = new Set(["read-write", "read-create", "write-only"]);

/**
 * Recursively prune to only writable leaves and their ancestor containers.
 * A node is a leaf if it has no children.
 */
function filterWritableTree(node: MIBTreeNode): MIBTreeNode | null {
  const isLeaf = !node.children || node.children.length === 0;

  if (isLeaf) {
    return WRITABLE_ACCESS.has(node.access) ? { ...node, children: undefined } : null;
  }

  const filtered: MIBTreeNode[] = [];
  for (const child of node.children!) {
    const kept = filterWritableTree(child);
    if (kept) filtered.push(kept);
  }

  if (filtered.length === 0) return null;
  return { ...node, children: filtered };
}

/**
 * Merge chains of single-child containers into one node with dotted label.
 * Stop before collapsing into a leaf.
 */
function collapseTree(node: MIBTreeNode): DisplayTreeNode {
  const isLeaf = !node.children || node.children.length === 0;

  if (isLeaf) {
    return {
      oid: node.oid,
      label: node.name,
      isLeaf: true,
      source: node,
      children: [],
    };
  }

  // Merge single-child container chains
  let current = node;
  let label = current.name;
  const collapsed: MIBTreeNode[] = [current];

  while (
    current.children &&
    current.children.length === 1 &&
    current.children[0].children &&
    current.children[0].children.length > 0
  ) {
    current = current.children[0];
    label += "." + current.name;
    collapsed.push(current);
  }

  const children = current.children!.map((c) => collapseTree(c));

  return {
    oid: current.oid,
    label,
    isLeaf: false,
    collapsedSources: collapsed,
    children,
  };
}

/** Get or build the cached display tree. */
function getDisplayTree(): DisplayTreeNode | null {
  if (cachedDisplayTree) return cachedDisplayTree;

  let raw: MIBTreeNode;
  try {
    raw = queryMIBTree();
  } catch {
    return null;
  }

  const filtered = filterWritableTree(raw);
  if (!filtered) return null;

  cachedDisplayTree = collapseTree(filtered);
  return cachedDisplayTree;
}

// ---------------------------------------------------------------------------
// Syntax-to-type mapping
// ---------------------------------------------------------------------------

function mapSyntaxToType(syntax: string): string {
  const s = syntax.trim();
  switch (s) {
    case "INTEGER":
    case "Integer32":
    case "TruthValue":
    case "RowStatus":
      return "Integer";
    case "Counter":
    case "Counter32":
      return "Counter32";
    case "Counter64":
      return "Counter64";
    case "Gauge":
    case "Gauge32":
      return "Gauge32";
    case "TimeTicks":
      return "TimeTicks";
    case "IpAddress":
      return "IPAddress";
    case "Unsigned32":
      return "Unsigned32";
    case "OCTET STRING":
    case "DisplayString":
    case "SnmpAdminString":
      return "String";
    case "MacAddress":
    case "PhysAddress":
      return "HexString";
    case "OBJECT IDENTIFIER":
      return "OID";
    default:
      return "String";
  }
}

// ---------------------------------------------------------------------------
// Search helpers
// ---------------------------------------------------------------------------

/** Collect all leaf nodes from the display tree. */
function collectLeaves(node: DisplayTreeNode): DisplayTreeNode[] {
  if (node.isLeaf) return [node];
  const result: DisplayTreeNode[] = [];
  for (const child of node.children) {
    result.push(...collectLeaves(child));
  }
  return result;
}

/** Return the set of OIDs for leaves matching the query. */
function searchLeaves(tree: DisplayTreeNode, query: string): Set<string> {
  const q = query.toLowerCase();
  const leaves = collectLeaves(tree);
  const matches = new Set<string>();
  for (const leaf of leaves) {
    const src = leaf.source;
    if (!src) continue;
    if (
      src.name.toLowerCase().includes(q) ||
      src.module.toLowerCase().includes(q) ||
      src.oid.includes(q)
    ) {
      matches.add(leaf.oid);
    }
  }
  return matches;
}

/**
 * Check if a node or any descendant has a matching leaf.
 */
function nodeHasMatch(node: DisplayTreeNode, matches: Set<string>): boolean {
  if (node.isLeaf) return matches.has(node.oid);
  return node.children.some((c) => nodeHasMatch(c, matches));
}

// ---------------------------------------------------------------------------
// Index helpers
// ---------------------------------------------------------------------------

/**
 * Walk the display tree to find the parent container of a leaf node,
 * then check its collapsedSources for a row-type node and return its indexes.
 * Returns the IndexObject array if found, or an empty array.
 */
function findRowIndexes(tree: DisplayTreeNode, leafOid: string): IndexObject[] {
  function search(node: DisplayTreeNode): IndexObject[] | null {
    if (node.isLeaf) return null;

    for (const child of node.children) {
      if (child.isLeaf && child.oid === leafOid) {
        // This node is the direct parent of the target leaf.
        // Check collapsedSources for a row node.
        if (node.collapsedSources) {
          const rowSrc = node.collapsedSources.find((s) => s.nodeType === "row");
          if (rowSrc && rowSrc.indexes && rowSrc.indexes.length > 0) {
            return rowSrc.indexes;
          }
        }
        return null;
      }
      // Recurse into non-leaf children
      const result = search(child);
      if (result !== null) return result;
    }
    return null;
  }

  return search(tree) ?? [];
}

// ---------------------------------------------------------------------------
// Modal UI
// ---------------------------------------------------------------------------

export function showMibBrowser(container: HTMLElement, options: MibBrowserOptions): void {
  const { modal, body, close } = createModal({
    cssPrefix: "mib-browser",
    title: "MIB Browser",
    container,
  });

  const tree = getDisplayTree();

  // --- State ---
  let selectedLeaf: DisplayTreeNode | null = null;
  const expandedOids = new Set<string>();
  let searchQuery = "";
  let searchMatches: Set<string> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // --- Search ---
  const searchWrap = document.createElement("div");
  searchWrap.className = "mib-browser-search-wrap";

  const searchInput = document.createElement("input");
  searchInput.className = "mib-browser-search";
  searchInput.type = "text";
  searchInput.placeholder = "Search by name, module, or OID\u2026";
  searchInput.addEventListener("input", () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      searchQuery = searchInput.value.trim();
      if (searchQuery && tree) {
        searchMatches = searchLeaves(tree, searchQuery);
        // Auto-expand branches leading to matches
        expandedOids.clear();
        autoExpandMatches(tree);
      } else {
        searchMatches = null;
        expandedOids.clear();
      }
      renderTree();
    }, 150);
  });

  searchWrap.appendChild(searchInput);

  // --- Body (flex row) ---
  const treePane = document.createElement("div");
  treePane.className = "mib-browser-tree-pane";

  const detailPane = document.createElement("div");
  detailPane.className = "mib-browser-detail-pane";

  body.appendChild(treePane);
  body.appendChild(detailPane);

  // --- Footer ---
  const footer = document.createElement("div");
  footer.className = "mib-browser-footer";

  const saveBtn = document.createElement("button");
  saveBtn.className = "toolbar-btn mib-browser-save-btn";
  saveBtn.textContent = "Save";
  saveBtn.disabled = true;
  saveBtn.addEventListener("click", () => {
    if (!selectedLeaf || !selectedLeaf.source) return;
    const src = selectedLeaf.source;
    let oid = src.oid;
    if (src.nodeType === "column") {
      const parts = indexInputs.map((inp) => inp.value.trim()).filter((v) => v !== "");
      if (parts.length > 0) {
        const joined = parts.join(".");
        oid = oid + (joined.startsWith(".") ? joined : "." + joined);
      }
    }
    const type = mapSyntaxToType(src.syntax);
    const value = useEnumSelect ? valueSelect.value : valueInput.value;

    // Build Net-SNMP style OID label: "MODULE::name" or "MODULE::name.index"
    let oidLabel: string | undefined;
    if (src.module && src.name) {
      const suffix = oid.slice(src.oid.length); // e.g. ".1" or ""
      oidLabel = `${src.module}::${src.name}${suffix}`;
    }

    // Find the matching enum label for the selected value
    let enumLabel: string | undefined;
    if (useEnumSelect && src.enums) {
      const match = src.enums.find((e) => String(e.value) === value);
      if (match) {
        enumLabel = `${match.label}(${match.value})`;
      }
    }

    options.onSave({ oid, type, value, oidLabel, enumLabel });
    close();
  });

  footer.appendChild(saveBtn);

  // --- Detail pane elements (created once, updated on selection) ---
  const detailEmpty = document.createElement("div");
  detailEmpty.className = "mib-browser-detail-empty";
  detailEmpty.textContent = "Select a leaf node to view details.";

  const detailContent = document.createElement("div");
  detailContent.className = "mib-browser-detail-content";
  detailContent.style.display = "none";

  const nameRow = createDetailRow("OID Name");
  const oidRow = createDetailRow("Numeric OID");
  const descRow = createDetailRow("Description", true);
  const typeRow = createDetailRow("Type");

  const indexContainer = document.createElement("div");
  indexContainer.className = "mib-browser-index-container";
  indexContainer.style.display = "none";

  /** Track current index input elements (one per index field). */
  let indexInputs: HTMLInputElement[] = [];

  /**
   * Render index fields into the index container.
   * When `indexes` has entries, one labeled input per IndexObject is created.
   * Otherwise a single generic "Instance Index" input is shown.
   */
  function renderIndexFields(indexes: IndexObject[]): void {
    indexContainer.innerHTML = "";
    indexInputs = [];

    if (indexes.length === 0) {
      // Fallback: single generic input
      const group = document.createElement("div");
      group.className = "mib-browser-detail-group";
      const lbl = document.createElement("label");
      lbl.className = "mib-browser-detail-label";
      lbl.textContent = "Instance Index";
      const inp = document.createElement("input");
      inp.className = "mib-browser-detail-input";
      inp.type = "text";
      inp.placeholder = "e.g. .1 or 1";
      inp.addEventListener("input", () => updateSaveState());
      group.appendChild(lbl);
      group.appendChild(inp);
      indexContainer.appendChild(group);
      indexInputs.push(inp);
      return;
    }

    for (const idx of indexes) {
      const group = document.createElement("div");
      group.className = "mib-browser-detail-group";

      const labelRow = document.createElement("div");
      labelRow.className = "mib-browser-index-label-row";

      const lbl = document.createElement("label");
      lbl.className = "mib-browser-detail-label";
      lbl.textContent = idx.name;
      labelRow.appendChild(lbl);

      // Build tooltip text from available metadata
      const tooltipParts: string[] = [];
      if (idx.syntax) tooltipParts.push(`Syntax: ${idx.syntax}`);
      if (idx.module) tooltipParts.push(`Module: ${idx.module}`);
      if (idx.description) tooltipParts.push(idx.description);

      if (tooltipParts.length > 0) {
        const infoWrap = document.createElement("span");
        infoWrap.className = "mib-browser-index-info";

        const icon = document.createElement("span");
        icon.className = "mib-browser-index-info-icon";
        icon.textContent = "\u24d8"; // ⓘ

        const tooltip = document.createElement("span");
        tooltip.className = "mib-browser-index-tooltip";
        tooltip.textContent = tooltipParts.join("\n");

        infoWrap.appendChild(icon);
        infoWrap.appendChild(tooltip);
        labelRow.appendChild(infoWrap);
      }

      group.appendChild(labelRow);

      const inp = document.createElement("input");
      inp.className = "mib-browser-detail-input";
      inp.type = "text";
      inp.placeholder = idx.syntax ? `${idx.syntax}` : "index value";
      inp.addEventListener("input", () => updateSaveState());
      group.appendChild(inp);

      indexContainer.appendChild(group);
      indexInputs.push(inp);
    }
  }

  const valueGroup = document.createElement("div");
  valueGroup.className = "mib-browser-detail-group";
  const valueLabel = document.createElement("label");
  valueLabel.className = "mib-browser-detail-label";
  valueLabel.textContent = "Value";
  const valueInput = document.createElement("input");
  valueInput.className = "mib-browser-detail-input";
  valueInput.type = "text";
  valueInput.placeholder = "Enter value\u2026";
  valueInput.addEventListener("input", () => updateSaveState());
  const valueSelect = document.createElement("select");
  valueSelect.className = "mib-browser-detail-input mib-browser-detail-select";
  valueSelect.style.display = "none";
  valueSelect.addEventListener("change", () => updateSaveState());
  valueGroup.appendChild(valueLabel);
  valueGroup.appendChild(valueInput);
  valueGroup.appendChild(valueSelect);

  /** Track whether the current leaf uses the enum dropdown. */
  let useEnumSelect = false;

  detailContent.appendChild(nameRow.container);
  detailContent.appendChild(oidRow.container);
  detailContent.appendChild(descRow.container);
  detailContent.appendChild(typeRow.container);
  detailContent.appendChild(indexContainer);
  detailContent.appendChild(valueGroup);

  const containerDetail = document.createElement("div");
  containerDetail.className = "mib-browser-container-detail";
  containerDetail.style.display = "none";

  detailPane.appendChild(detailEmpty);
  detailPane.appendChild(detailContent);
  detailPane.appendChild(containerDetail);

  // --- Assemble modal ---
  modal.appendChild(searchWrap);
  modal.appendChild(body);
  modal.appendChild(footer);

  // --- Helper: create a detail row ---
  function createDetailRow(
    labelText: string,
    scrollable = false,
  ): { container: HTMLElement; value: HTMLElement } {
    const group = document.createElement("div");
    group.className = "mib-browser-detail-group";
    const lbl = document.createElement("label");
    lbl.className = "mib-browser-detail-label";
    lbl.textContent = labelText;
    const val = document.createElement("div");
    val.className = scrollable
      ? "mib-browser-detail-value mib-browser-detail-value-scroll"
      : "mib-browser-detail-value";
    group.appendChild(lbl);
    group.appendChild(val);
    return { container: group, value: val };
  }

  // --- Update save button state ---
  function updateSaveState(): void {
    const hasValue = useEnumSelect
      ? valueSelect.value !== ""
      : valueInput.value.trim().length > 0;
    saveBtn.disabled = !selectedLeaf || !hasValue;
  }

  // --- Auto-expand branches to matching leaves ---
  function autoExpandMatches(node: DisplayTreeNode): void {
    if (node.isLeaf) return;
    if (searchMatches && nodeHasMatch(node, searchMatches)) {
      expandedOids.add(node.oid);
      for (const child of node.children) {
        autoExpandMatches(child);
      }
    }
  }

  // --- Show container detail in the right pane ---
  function showContainerDetail(node: DisplayTreeNode): void {
    const sources = node.collapsedSources;
    if (!sources || sources.length === 0) return;

    // Determine if this is a table+row container
    const tableSrc = sources.find((s) => s.nodeType === "table");
    const rowSrc = sources.find((s) => s.nodeType === "row");
    const isTableRow = !!(tableSrc && rowSrc);

    // Determine if this is a scalar container (children are leaves, sources are "node" type)
    const isScalarContainer =
      !isTableRow &&
      node.children.some((c) => c.isLeaf) &&
      sources.some((s) => s.nodeType === "node" && s.description);

    if (!isTableRow && !isScalarContainer) return;

    // Clear leaf selection state
    selectedLeaf = null;
    saveBtn.disabled = true;

    // Toggle visibility
    detailEmpty.style.display = "none";
    detailContent.style.display = "none";
    containerDetail.style.display = "";
    containerDetail.innerHTML = "";

    if (isTableRow) {
      // Table section
      const tableSection = document.createElement("div");
      tableSection.className = "mib-browser-container-section";
      const tableName = document.createElement("div");
      tableName.className = "mib-browser-container-name";
      tableName.textContent = tableSrc.module
        ? `${tableSrc.module}::${tableSrc.name}`
        : tableSrc.name;
      const tableDesc = document.createElement("div");
      tableDesc.className = "mib-browser-container-desc";
      tableDesc.textContent = tableSrc.description || "(no description)";
      tableSection.appendChild(tableName);
      tableSection.appendChild(tableDesc);
      containerDetail.appendChild(tableSection);

      // Row section
      const rowSection = document.createElement("div");
      rowSection.className = "mib-browser-container-section";
      const rowName = document.createElement("div");
      rowName.className = "mib-browser-container-name";
      rowName.textContent = rowSrc.module
        ? `${rowSrc.module}::${rowSrc.name}`
        : rowSrc.name;
      const rowDesc = document.createElement("div");
      rowDesc.className = "mib-browser-container-desc";
      rowDesc.textContent = rowSrc.description || "(no description)";
      rowSection.appendChild(rowName);
      rowSection.appendChild(rowDesc);
      containerDetail.appendChild(rowSection);
    } else {
      // Scalar container — find the source with a description
      const src = sources.find((s) => s.nodeType === "node" && s.description) || sources[0];
      const section = document.createElement("div");
      section.className = "mib-browser-container-section";
      const name = document.createElement("div");
      name.className = "mib-browser-container-name";
      name.textContent = src.module ? `${src.module}::${src.name}` : src.name;
      const desc = document.createElement("div");
      desc.className = "mib-browser-container-desc";
      desc.textContent = src.description || "(no description)";
      section.appendChild(name);
      section.appendChild(desc);
      containerDetail.appendChild(section);
    }

    // Clear tree selection highlight
    treePane.querySelectorAll(".mib-browser-tree-node-selected").forEach((el) => {
      el.classList.remove("mib-browser-tree-node-selected");
    });
  }

  // --- Select a leaf node ---
  function selectLeaf(node: DisplayTreeNode): void {
    selectedLeaf = node;
    const src = node.source!;

    detailEmpty.style.display = "none";
    detailContent.style.display = "";
    containerDetail.style.display = "none";

    nameRow.value.textContent = src.module ? `${src.module}::${src.name}` : src.name;
    oidRow.value.textContent = src.oid;
    descRow.value.textContent = src.description || "(no description)";
    typeRow.value.textContent = mapSyntaxToType(src.syntax);

    if (src.nodeType === "column") {
      const indexes = tree ? findRowIndexes(tree, node.oid) : [];
      renderIndexFields(indexes);
      indexContainer.style.display = "";
    } else {
      indexContainer.style.display = "none";
      indexInputs = [];
      indexContainer.innerHTML = "";
    }

    // Swap between freeform input and enum dropdown
    if (src.enums && src.enums.length > 0) {
      useEnumSelect = true;
      valueInput.style.display = "none";
      valueSelect.style.display = "";
      valueSelect.innerHTML = "";
      for (const e of src.enums) {
        const opt = document.createElement("option");
        opt.value = String(e.value);
        opt.textContent = `${e.value} (${e.label})`;
        valueSelect.appendChild(opt);
      }
      // Pre-select first option
      valueSelect.selectedIndex = 0;
    } else {
      useEnumSelect = false;
      valueInput.style.display = "";
      valueSelect.style.display = "none";
      valueInput.value = "";
    }

    // In edit mode, pre-populate if matching
    // Value is populated by edit-mode setup, or left blank for add mode
    updateSaveState();

    // Update tree selection highlight
    treePane.querySelectorAll(".mib-browser-tree-node-selected").forEach((el) => {
      el.classList.remove("mib-browser-tree-node-selected");
    });
    const selectedEl = treePane.querySelector(`[data-oid="${CSS.escape(node.oid)}"]`);
    if (selectedEl) selectedEl.classList.add("mib-browser-tree-node-selected");
  }

  // --- Render the tree ---
  function renderTree(): void {
    treePane.innerHTML = "";

    if (!tree) {
      const empty = document.createElement("div");
      empty.className = "mib-browser-tree-empty";
      empty.textContent = "No MIBs loaded, or no writable OIDs found.";
      treePane.appendChild(empty);
      return;
    }

    if (searchMatches && searchMatches.size === 0) {
      const empty = document.createElement("div");
      empty.className = "mib-browser-tree-empty";
      empty.textContent = "No matching OIDs found.";
      treePane.appendChild(empty);
      return;
    }

    // Render from root's children (skip the root node itself)
    for (const child of tree.children) {
      renderNode(child, treePane, 0);
    }
  }

  function renderNode(node: DisplayTreeNode, parent: HTMLElement, depth: number): void {
    // If searching, skip branches with no matching leaves
    if (searchMatches && !nodeHasMatch(node, searchMatches)) return;

    const row = document.createElement("div");
    row.className = "mib-browser-tree-node";
    row.style.paddingLeft = `${8 + depth * 16}px`;
    row.dataset.oid = node.oid;

    if (node.isLeaf) {
      const bullet = document.createElement("span");
      bullet.className = "mib-browser-tree-icon mib-browser-tree-leaf-icon";
      bullet.textContent = "\u25cf";
      row.appendChild(bullet);

      const label = document.createElement("span");
      label.className = "mib-browser-tree-label mib-browser-tree-leaf-label";
      label.textContent = node.label;
      if (searchMatches && searchMatches.has(node.oid)) {
        label.classList.add("mib-browser-tree-match");
      }
      row.appendChild(label);

      row.addEventListener("click", () => selectLeaf(node));

      if (selectedLeaf && selectedLeaf.oid === node.oid) {
        row.classList.add("mib-browser-tree-node-selected");
      }
    } else {
      const isExpanded = expandedOids.has(node.oid);
      const chevron = document.createElement("span");
      chevron.className = "mib-browser-tree-icon mib-browser-tree-chevron";
      chevron.textContent = isExpanded ? "\u25be" : "\u25b8";
      row.appendChild(chevron);

      const label = document.createElement("span");
      label.className = "mib-browser-tree-label";
      label.textContent = node.label;
      row.appendChild(label);

      row.addEventListener("click", () => {
        if (expandedOids.has(node.oid)) {
          expandedOids.delete(node.oid);
        } else {
          expandedOids.add(node.oid);
        }
        showContainerDetail(node);
        renderTree();
      });

      parent.appendChild(row);

      // Lazy: only render children when expanded
      if (isExpanded) {
        for (const child of node.children) {
          renderNode(child, parent, depth + 1);
        }
      }
      return;
    }

    parent.appendChild(row);
  }

  // --- Edit mode: find and select the existing OID ---
  function initEditMode(): void {
    if (options.mode !== "edit" || !options.existingOid || !tree) return;

    const targetOid = options.existingOid;

    // Find the leaf. For column nodes, the existingOid might include an
    // instance index suffix (e.g., "1.3.6.1.2.1.2.2.1.7.1"). We try
    // progressively shorter prefixes until we find a matching leaf.
    let found: DisplayTreeNode | null = null;
    let instanceIndex = "";

    const allLeaves = collectLeaves(tree);

    // First try an exact match
    found = allLeaves.find((l) => l.oid === targetOid) ?? null;

    if (!found) {
      // Try stripping instance index components from the end
      const parts = targetOid.split(".");
      for (let i = parts.length - 1; i > 0; i--) {
        const prefix = parts.slice(0, i).join(".");
        const candidate = allLeaves.find((l) => l.oid === prefix);
        if (candidate) {
          found = candidate;
          instanceIndex = parts.slice(i).join(".");
          break;
        }
      }
    }

    if (!found) return;

    // Expand all ancestor branches leading to this leaf
    expandAncestors(tree, found.oid);

    // Render the tree first so the node exists in DOM
    renderTree();

    // Select the leaf
    selectLeaf(found);

    // Pre-populate index fields
    if (instanceIndex) {
      if (indexInputs.length <= 1) {
        // Single (or fallback) input: set the whole value
        if (indexInputs[0]) indexInputs[0].value = instanceIndex;
      } else {
        // Multiple named inputs: distribute dot-split parts across fields
        const idxParts = instanceIndex.split(".");
        for (let i = 0; i < indexInputs.length && i < idxParts.length; i++) {
          indexInputs[i].value = idxParts[i];
        }
      }
    }
    if (options.existingValue !== undefined) {
      if (useEnumSelect) {
        valueSelect.value = options.existingValue;
      } else {
        valueInput.value = options.existingValue;
      }
    }

    updateSaveState();

    // Scroll the selected node into view
    requestAnimationFrame(() => {
      const el = treePane.querySelector(`[data-oid="${CSS.escape(found!.oid)}"]`);
      if (el) el.scrollIntoView({ block: "center" });
    });
  }

  /**
   * Walk the display tree and expand all container ancestors of the target OID.
   * Returns true if the target is found under this subtree.
   */
  function expandAncestors(node: DisplayTreeNode, targetOid: string): boolean {
    if (node.isLeaf) return node.oid === targetOid;

    for (const child of node.children) {
      if (expandAncestors(child, targetOid)) {
        expandedOids.add(node.oid);
        return true;
      }
    }
    return false;
  }

  // --- Initial render ---
  renderTree();

  // Detail starts empty
  detailEmpty.style.display = "";
  detailContent.style.display = "none";

  // Edit mode initialization
  if (options.mode === "edit") {
    initEditMode();
  }

  searchInput.focus();
}
