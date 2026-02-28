/**
 * Vendor Schema Manager — state tracking and modal UI for loading
 * vendor-specific JTD schema files into the WASM registry.
 *
 * Vendor schemas define typed sub-TLVs for VendorSpecific (TLV 43)
 * entries, replacing generic hex type/value pairs with named properties.
 */

import { loadVendorSchema } from "../codec/index";
import { showToast } from "./toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VendorSchemaEntry {
  filename: string;
  content: string;
  oui: string;
  vendorName: string;
  extensionPoints: string[];
  source: "bundled" | "user";
}

interface VendorSchemaMetadata {
  oui: string;
  vendorName: string;
  extensionPoints: string[];
  illustrative?: boolean;
  description?: string;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const STORAGE_KEY = "opendci-vendor-schemas";

const schemas = new Map<string, VendorSchemaEntry>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Populate state from the bundled vendor schemas loaded during init. */
export function initVendorSchemaState(bundle: Record<string, unknown>): void {
  for (const [filename, schema] of Object.entries(bundle)) {
    const meta = extractMetadata(schema);
    if (!meta) continue;
    schemas.set(meta.oui, {
      filename,
      content: JSON.stringify(schema),
      oui: meta.oui,
      vendorName: meta.vendorName,
      extensionPoints: meta.extensionPoints,
      source: "bundled",
    });
  }

  // Restore user-uploaded schemas from localStorage.
  restoreFromStorage();
}

/** Show the vendor schema manager modal. */
export function showVendorSchemaModal(container: HTMLElement): void {
  const existing = container.querySelector(".vendor-modal-backdrop");
  if (existing) existing.remove();

  const backdrop = document.createElement("div");
  backdrop.className = "vendor-modal-backdrop";

  const modal = document.createElement("div");
  modal.className = "vendor-modal";

  // Header
  const header = document.createElement("div");
  header.className = "vendor-modal-header";
  const titleEl = document.createElement("span");
  titleEl.className = "vendor-modal-title";
  titleEl.textContent = "Vendor Schemas";
  const closeBtn = document.createElement("button");
  closeBtn.className = "vendor-modal-close";
  closeBtn.textContent = "\u00d7";
  closeBtn.addEventListener("click", () => close());
  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  // Controls
  const controls = document.createElement("div");
  controls.className = "vendor-modal-controls";

  const loadBtn = document.createElement("button");
  loadBtn.className = "toolbar-btn";
  loadBtn.textContent = "Load Schema\u2026";
  loadBtn.addEventListener("click", async () => {
    try {
      const files = await pickVendorSchemaFiles();
      let loaded = 0;
      for (const [filename, content] of Object.entries(files)) {
        try {
          const added = addUserSchema(filename, content);
          if (added) loaded++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`Vendor schema load error (${filename}):`, e);
          showToast(`Could not load vendor schema "${filename}".`, "error");
        }
      }
      if (loaded > 0) {
        renderList();
        updateCount();
      }
    } catch (e) {
      if (e instanceof Error && e.message !== "File selection cancelled") {
        console.error("Failed to load vendor schemas:", e);
      }
    }
  });

  const countLabel = document.createElement("span");
  countLabel.className = "vendor-modal-count";

  controls.appendChild(loadBtn);
  controls.appendChild(countLabel);

  // List
  const list = document.createElement("div");
  list.className = "vendor-modal-list";

  function updateCount(): void {
    countLabel.textContent = `${schemas.size} vendor schema(s) loaded`;
  }

  function renderList(): void {
    list.innerHTML = "";
    const entries = getSortedSchemas();

    if (entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "vendor-modal-empty";
      empty.textContent = "No vendor schemas loaded. Click \"Load Schema\u2026\" to add one.";
      list.appendChild(empty);
      return;
    }

    for (const entry of entries) {
      const row = document.createElement("div");
      row.className = "vendor-modal-row";

      const info = document.createElement("div");
      info.className = "vendor-modal-info";

      const nameRow = document.createElement("div");
      nameRow.className = "vendor-modal-name-row";

      const name = document.createElement("span");
      name.className = "vendor-modal-name";
      name.textContent = entry.vendorName;

      const oui = document.createElement("span");
      oui.className = "vendor-modal-oui";
      oui.textContent = formatOui(entry.oui);

      const badge = document.createElement("span");
      badge.className = `vendor-modal-badge vendor-modal-badge-${entry.source}`;
      badge.textContent = entry.source;

      nameRow.appendChild(name);
      nameRow.appendChild(oui);
      nameRow.appendChild(badge);

      const extPoints = document.createElement("div");
      extPoints.className = "vendor-modal-ext-points";
      extPoints.textContent = `Extension points: ${entry.extensionPoints.join(", ")}`;

      info.appendChild(nameRow);
      info.appendChild(extPoints);

      row.appendChild(info);

      // Remove button only for user-uploaded schemas
      if (entry.source === "user") {
        const removeBtn = document.createElement("button");
        removeBtn.className = "vendor-modal-remove";
        removeBtn.textContent = "\u00d7";
        removeBtn.title = `Remove ${entry.vendorName} (requires page reload to take effect)`;
        removeBtn.addEventListener("click", () => {
          removeUserSchema(entry.oui);
          renderList();
          updateCount();
        });
        row.appendChild(removeBtn);
      }

      list.appendChild(row);
    }
  }

  modal.appendChild(header);
  modal.appendChild(controls);
  modal.appendChild(list);
  backdrop.appendChild(modal);
  container.appendChild(backdrop);

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

  renderList();
  updateCount();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getSortedSchemas(): VendorSchemaEntry[] {
  return [...schemas.values()].sort((a, b) => {
    if (a.source !== b.source) return a.source === "user" ? -1 : 1;
    return a.vendorName.localeCompare(b.vendorName);
  });
}

function extractMetadata(schema: unknown): VendorSchemaMetadata | null {
  if (!schema || typeof schema !== "object") return null;
  const meta = (schema as Record<string, unknown>).metadata;
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  if (typeof m.oui !== "string" || typeof m.vendorName !== "string") return null;
  return {
    oui: m.oui as string,
    vendorName: m.vendorName as string,
    extensionPoints: Array.isArray(m.extensionPoints)
      ? (m.extensionPoints as string[])
      : [],
    illustrative: m.illustrative === true,
    description: typeof m.description === "string" ? m.description : undefined,
  };
}

function formatOui(oui: string): string {
  if (oui.length !== 6) return oui;
  return `${oui.slice(0, 2)}:${oui.slice(2, 4)}:${oui.slice(4, 6)}`.toUpperCase();
}

export function addUserSchema(filename: string, content: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Invalid JSON");
  }

  const meta = extractMetadata(parsed);
  if (!meta) {
    throw new Error("Missing or invalid metadata (requires oui, vendorName, extensionPoints)");
  }

  // Load into WASM registry.
  loadVendorSchema(content);

  schemas.set(meta.oui, {
    filename,
    content,
    oui: meta.oui,
    vendorName: meta.vendorName,
    extensionPoints: meta.extensionPoints,
    source: "user",
  });

  saveToStorage();
  return true;
}

/**
 * Remove a user-uploaded vendor schema from state and localStorage.
 * Note: the WASM registry has no unload API, so the schema remains
 * active in the registry until page reload.
 */
function removeUserSchema(oui: string): void {
  schemas.delete(oui);
  saveToStorage();
}

function saveToStorage(): void {
  const userSchemas: Record<string, string> = {};
  for (const entry of schemas.values()) {
    if (entry.source === "user") {
      userSchemas[entry.filename] = entry.content;
    }
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userSchemas));
  } catch {
    // localStorage full or unavailable — silently ignore.
  }
}

function restoreFromStorage(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    const userSchemas: Record<string, string> = JSON.parse(stored);
    for (const [filename, content] of Object.entries(userSchemas)) {
      try {
        addUserSchema(filename, content);
      } catch (e) {
        console.warn(`Failed to restore vendor schema ${filename}:`, e);
      }
    }
  } catch {
    // localStorage unavailable or corrupt — silently ignore.
  }
}

async function pickVendorSchemaFiles(): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.jtd.json";
    input.multiple = true;
    input.addEventListener("change", async () => {
      const files = input.files;
      if (!files || files.length === 0) {
        reject(new Error("File selection cancelled"));
        return;
      }
      const result: Record<string, string> = {};
      for (const file of Array.from(files)) {
        result[file.name] = await file.text();
      }
      resolve(result);
    });
    input.addEventListener("cancel", () => {
      reject(new Error("File selection cancelled"));
    });
    input.click();
  });
}
