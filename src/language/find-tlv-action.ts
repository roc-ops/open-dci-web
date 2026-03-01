/**
 * Find TLV action — registers a "Find TLV Property" command (Ctrl+Shift+T)
 * that opens a searchable modal listing all TLV property keys in the current
 * document. Selecting an entry jumps to that property in the editor.
 */

import * as monaco from "monaco-editor";
import { parseTree, type Node } from "jsonc-parser";
import { createModal } from "../ui/modal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TlvEntry {
  /** The property key name (e.g. "MaxSustainedTrafficRate"). */
  name: string;
  /** Dot-separated path (e.g. "DownstreamServiceFlow.[0].MaxSustainedTrafficRate"). */
  path: string;
  /** 1-based line number in the document. */
  line: number;
  /** 1-based column number in the document. */
  col: number;
}

// ---------------------------------------------------------------------------
// Tree walking
// ---------------------------------------------------------------------------

/**
 * Recursively walks the JSONC AST and collects all property key nodes along
 * with their full dot-paths and document positions.
 */
function collectProperties(
  model: monaco.editor.ITextModel,
  node: Node,
  pathSegments: string[],
  results: TlvEntry[],
): void {
  if (node.type === "object" && node.children) {
    for (const prop of node.children) {
      if (prop.type !== "property" || !prop.children || prop.children.length < 2) {
        continue;
      }

      const keyNode = prop.children[0];
      const valueNode = prop.children[1];
      const name = String(keyNode.value ?? "");
      const currentPath = [...pathSegments, name];
      const pos = model.getPositionAt(keyNode.offset);

      results.push({
        name,
        path: currentPath.join("."),
        line: pos.lineNumber,
        col: pos.column,
      });

      // Recurse into the value
      collectProperties(model, valueNode, currentPath, results);
    }
  } else if (node.type === "array" && node.children) {
    for (let i = 0; i < node.children.length; i++) {
      const element = node.children[i];
      const indexSegment = `[${i}]`;
      const currentPath = [...pathSegments, indexSegment];
      collectProperties(model, element, currentPath, results);
    }
  }
}

// ---------------------------------------------------------------------------
// Modal UI
// ---------------------------------------------------------------------------

/**
 * Renders a filtered list of TLV entries into the list container.
 * Returns the filtered entries for keyboard navigation tracking.
 */
function renderList(
  listEl: HTMLDivElement,
  entries: TlvEntry[],
  filter: string,
  selectedIndex: number,
  onSelect: (entry: TlvEntry) => void,
): TlvEntry[] {
  listEl.innerHTML = "";
  const lowerFilter = filter.toLowerCase();

  const filtered = filter
    ? entries.filter(
        (e) =>
          e.name.toLowerCase().includes(lowerFilter) ||
          e.path.toLowerCase().includes(lowerFilter),
      )
    : entries;

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "find-tlv-empty";
    empty.textContent = filter ? "No matching properties." : "No properties found in the document.";
    listEl.appendChild(empty);
    return filtered;
  }

  for (let i = 0; i < filtered.length; i++) {
    const entry = filtered[i];
    const item = document.createElement("div");
    item.className = "find-tlv-item";
    if (i === selectedIndex) {
      item.classList.add("selected");
    }
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", i === selectedIndex ? "true" : "false");

    const nameSpan = document.createElement("span");
    nameSpan.className = "find-tlv-name";
    nameSpan.textContent = entry.name;

    const pathSpan = document.createElement("span");
    pathSpan.className = "find-tlv-path";
    pathSpan.textContent = entry.path;

    const lineSpan = document.createElement("span");
    lineSpan.className = "find-tlv-line";
    lineSpan.textContent = `Ln ${entry.line}`;

    item.appendChild(nameSpan);
    item.appendChild(pathSpan);
    item.appendChild(lineSpan);

    item.addEventListener("click", () => onSelect(entry));

    listEl.appendChild(item);
  }

  // Scroll the selected item into view
  if (selectedIndex >= 0 && selectedIndex < filtered.length) {
    const selectedEl = listEl.children[selectedIndex] as HTMLElement | undefined;
    selectedEl?.scrollIntoView({ block: "nearest" });
  }

  return filtered;
}

// ---------------------------------------------------------------------------
// Action registration
// ---------------------------------------------------------------------------

/**
 * Registers the "Find TLV Property" action on the Monaco editor.
 * When triggered, it parses the current document, collects all property keys,
 * and shows a searchable modal. Selecting a property jumps to its location.
 */
export function registerFindTlvAction(
  editor: monaco.editor.IStandaloneCodeEditor,
  container: HTMLElement,
): void {
  editor.addAction({
    id: "docsis-find-tlv",
    label: "Find TLV Property",
    keybindings: [
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyT,
    ],

    run: (ed: monaco.editor.ICodeEditor) => {
      const model = ed.getModel();
      if (!model) return;

      // Parse the document and collect all property keys
      const text = model.getValue();
      const tree = parseTree(text, undefined, {
        allowTrailingComma: true,
        disallowComments: false,
      });

      const entries: TlvEntry[] = [];
      if (tree) {
        collectProperties(model, tree, [], entries);
      }

      // Create the modal
      const { modal, body, close } = createModal({
        cssPrefix: "find-tlv",
        title: "Find TLV Property",
        container,
      });

      modal.classList.add("find-tlv-modal");

      // Search input
      const input = document.createElement("input");
      input.type = "text";
      input.className = "find-tlv-input";
      input.placeholder = "Type to filter properties\u2026";
      input.setAttribute("aria-label", "Filter TLV properties");

      // List container
      const listEl = document.createElement("div");
      listEl.className = "find-tlv-list";
      listEl.setAttribute("role", "listbox");

      body.appendChild(input);
      body.appendChild(listEl);
      modal.appendChild(body);

      // State
      let selectedIndex = 0;
      let currentFiltered: TlvEntry[] = [];

      /** Jump to the given entry and close the modal. */
      function jumpTo(entry: TlvEntry): void {
        const pos = { lineNumber: entry.line, column: entry.col };
        ed.setPosition(pos);
        ed.revealLineInCenter(entry.line);
        close();
        ed.focus();
      }

      /** Re-render the list with the current filter and selection. */
      function update(): void {
        currentFiltered = renderList(
          listEl,
          entries,
          input.value,
          selectedIndex,
          jumpTo,
        );
      }

      // Initial render
      update();

      // Filter as user types
      input.addEventListener("input", () => {
        selectedIndex = 0;
        update();
      });

      // Keyboard navigation
      input.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          if (currentFiltered.length > 0) {
            selectedIndex = (selectedIndex + 1) % currentFiltered.length;
            update();
          }
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (currentFiltered.length > 0) {
            selectedIndex =
              (selectedIndex - 1 + currentFiltered.length) %
              currentFiltered.length;
            update();
          }
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (
            currentFiltered.length > 0 &&
            selectedIndex >= 0 &&
            selectedIndex < currentFiltered.length
          ) {
            jumpTo(currentFiltered[selectedIndex]);
          }
        }
      });

      // Focus the input
      requestAnimationFrame(() => input.focus());
    },
  });
}
