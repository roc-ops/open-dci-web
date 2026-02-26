/**
 * MIB Browser — split-pane modal for browsing loaded MIBs.
 *
 * Left pane (45%) shows a collapsible tree of writable OID leaves.
 * Right pane (55%) shows details and value entry for the selected leaf.
 * Includes search by name or numeric OID.
 */

import { queryMIBTree } from "../codec/index";
import type { MIBTreeNode } from "../codec/index";

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
// Modal UI
// ---------------------------------------------------------------------------

export function showMibBrowser(container: HTMLElement, options: MibBrowserOptions): void {
  // Remove any existing browser modal
  const existing = container.querySelector(".mib-browser-backdrop");
  if (existing) existing.remove();

  const tree = getDisplayTree();

  // --- State ---
  let selectedLeaf: DisplayTreeNode | null = null;
  const expandedOids = new Set<string>();
  let searchQuery = "";
  let searchMatches: Set<string> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // --- Backdrop ---
  const backdrop = document.createElement("div");
  backdrop.className = "mib-browser-backdrop";

  const modal = document.createElement("div");
  modal.className = "mib-browser-modal";

  // --- Header ---
  const header = document.createElement("div");
  header.className = "mib-browser-header";

  const titleEl = document.createElement("span");
  titleEl.className = "mib-browser-title";
  titleEl.textContent = "MIB Browser";

  const closeBtn = document.createElement("button");
  closeBtn.className = "mib-browser-close";
  closeBtn.textContent = "\u00d7";
  closeBtn.addEventListener("click", () => close());

  header.appendChild(titleEl);
  header.appendChild(closeBtn);

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
  const body = document.createElement("div");
  body.className = "mib-browser-body";

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
      let idx = indexInput.value.trim();
      if (idx && !idx.startsWith(".")) idx = "." + idx;
      oid = oid + idx;
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

  const indexGroup = document.createElement("div");
  indexGroup.className = "mib-browser-detail-group";
  indexGroup.style.display = "none";
  const indexLabel = document.createElement("label");
  indexLabel.className = "mib-browser-detail-label";
  indexLabel.textContent = "Instance Index";
  const indexInput = document.createElement("input");
  indexInput.className = "mib-browser-detail-input";
  indexInput.type = "text";
  indexInput.placeholder = "e.g. .1 or 1";
  indexInput.addEventListener("input", () => updateSaveState());
  indexGroup.appendChild(indexLabel);
  indexGroup.appendChild(indexInput);

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
  detailContent.appendChild(indexGroup);
  detailContent.appendChild(valueGroup);

  const containerDetail = document.createElement("div");
  containerDetail.className = "mib-browser-container-detail";
  containerDetail.style.display = "none";

  detailPane.appendChild(detailEmpty);
  detailPane.appendChild(detailContent);
  detailPane.appendChild(containerDetail);

  // --- Assemble modal ---
  modal.appendChild(header);
  modal.appendChild(searchWrap);
  modal.appendChild(body);
  modal.appendChild(footer);
  backdrop.appendChild(modal);
  container.appendChild(backdrop);

  // --- Close handlers ---
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  function close(): void {
    backdrop.remove();
    document.removeEventListener("keydown", escHandler);
  }

  function escHandler(e: KeyboardEvent): void {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", escHandler);

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
      indexGroup.style.display = "";
    } else {
      indexGroup.style.display = "none";
      indexInput.value = "";
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

    // Pre-populate fields
    if (instanceIndex) {
      indexInput.value = instanceIndex;
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
