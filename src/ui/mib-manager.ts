/**
 * MIB Manager — state tracking and modal UI for loading/unloading MIBs.
 */

import { loadMIBs, resetMIBs } from "../codec/index";
import { invalidateMibBrowserCache } from "./mib-browser";

export interface MibEntry {
  filename: string;
  content: string;
  source: "bundled" | "user";
  lastUpdated: string | null;
}

const mibs = new Map<string, MibEntry>();

/** Extract LAST-UPDATED from SMIv2 MODULE-IDENTITY macro and format as readable date. */
function extractLastUpdated(content: string): string | null {
  const m = content.match(/LAST-UPDATED\s*"(\d+)Z?"/);
  if (!m) return null;
  const raw = m[1];
  // Format: YYYYMMDDHHMMZ or YYMMDDHHMMZ
  let year: string, month: string, day: string;
  if (raw.length >= 12) {
    year = raw.slice(0, 4);
    month = raw.slice(4, 6);
    day = raw.slice(6, 8);
  } else if (raw.length >= 10) {
    const yy = parseInt(raw.slice(0, 2), 10);
    year = (yy >= 70 ? "19" : "20") + raw.slice(0, 2);
    month = raw.slice(2, 4);
    day = raw.slice(4, 6);
  } else {
    return null;
  }
  return `${year}-${month}-${day}`;
}

/** Populate MIB state from the bundled MIB set loaded during init. */
export function initMibState(bundle: Record<string, string>): void {
  for (const [filename, content] of Object.entries(bundle)) {
    mibs.set(filename, { filename, content, source: "bundled", lastUpdated: extractLastUpdated(content) });
  }
}

function getSortedMibs(): MibEntry[] {
  return [...mibs.values()].sort((a, b) => {
    if (a.source !== b.source) return a.source === "user" ? -1 : 1;
    return a.filename.localeCompare(b.filename);
  });
}

function addUserMibs(files: Record<string, string>): number {
  const loaded = loadMIBs(files);
  for (const [filename, content] of Object.entries(files)) {
    mibs.set(filename, { filename, content, source: "user", lastUpdated: extractLastUpdated(content) });
  }
  return loaded;
}

async function removeMib(filename: string): Promise<void> {
  mibs.delete(filename);
  resetMIBs();
  const remaining: Record<string, string> = {};
  for (const [name, entry] of mibs) {
    remaining[name] = entry.content;
  }
  if (Object.keys(remaining).length > 0) {
    await new Promise((r) => setTimeout(r, 0));
    loadMIBs(remaining);
  }
}

async function pickMibFiles(): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".mib,.txt,.my";
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

/** Show the MIB manager modal. */
export function showMibModal(container: HTMLElement): void {
  const existing = container.querySelector(".mib-modal-backdrop");
  if (existing) existing.remove();

  const backdrop = document.createElement("div");
  backdrop.className = "mib-modal-backdrop";

  const modal = document.createElement("div");
  modal.className = "mib-modal";

  // Header
  const header = document.createElement("div");
  header.className = "mib-modal-header";
  const titleEl = document.createElement("span");
  titleEl.className = "mib-modal-title";
  titleEl.textContent = "MIB Manager";
  const closeBtn = document.createElement("button");
  closeBtn.className = "mib-modal-close";
  closeBtn.textContent = "\u00d7";
  closeBtn.addEventListener("click", () => close());
  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  // Controls
  const controls = document.createElement("div");
  controls.className = "mib-modal-controls";

  const loadBtn = document.createElement("button");
  loadBtn.className = "toolbar-btn";
  loadBtn.textContent = "Load MIBs\u2026";
  loadBtn.addEventListener("click", async () => {
    try {
      const files = await pickMibFiles();
      if (Object.keys(files).length === 0) return;
      addUserMibs(files);
      invalidateMibBrowserCache();
      renderList();
      updateCount();
    } catch (e) {
      if (e instanceof Error && e.message !== "File selection cancelled") {
        console.error("Failed to load MIBs:", e);
      }
    }
  });

  const countLabel = document.createElement("span");
  countLabel.className = "mib-modal-count";

  const filterInput = document.createElement("input");
  filterInput.className = "mib-modal-filter";
  filterInput.type = "text";
  filterInput.placeholder = "Filter\u2026";
  filterInput.addEventListener("input", () => renderList());

  controls.appendChild(loadBtn);
  controls.appendChild(countLabel);
  controls.appendChild(filterInput);

  // Status (shown during reload)
  const status = document.createElement("div");
  status.className = "mib-modal-status";
  status.style.display = "none";

  // List
  const list = document.createElement("div");
  list.className = "mib-modal-list";

  function updateCount(): void {
    countLabel.textContent = `${mibs.size} MIBs loaded`;
  }

  function renderList(): void {
    list.innerHTML = "";
    const filter = filterInput.value.toLowerCase();
    const entries = getSortedMibs();
    let shown = 0;

    for (const entry of entries) {
      if (filter && !entry.filename.toLowerCase().includes(filter)) continue;
      shown++;

      const row = document.createElement("div");
      row.className = "mib-modal-row";

      const name = document.createElement("span");
      name.className = "mib-modal-name";
      name.textContent = entry.lastUpdated
        ? `${entry.filename} (${entry.lastUpdated})`
        : entry.filename;

      const badge = document.createElement("span");
      badge.className = `mib-modal-badge mib-modal-badge-${entry.source}`;
      badge.textContent = entry.source;

      const removeBtn = document.createElement("button");
      removeBtn.className = "mib-modal-remove";
      removeBtn.textContent = "\u00d7";
      removeBtn.title = `Remove ${entry.filename}`;
      removeBtn.addEventListener("click", async () => {
        status.textContent = `Reloading ${mibs.size - 1} MIBs\u2026`;
        status.style.display = "";
        list.querySelectorAll<HTMLButtonElement>(".mib-modal-remove").forEach(
          (b) => (b.disabled = true),
        );
        loadBtn.disabled = true;

        await removeMib(entry.filename);
        invalidateMibBrowserCache();

        status.style.display = "none";
        loadBtn.disabled = false;
        renderList();
        updateCount();
      });

      row.appendChild(name);
      row.appendChild(badge);
      row.appendChild(removeBtn);
      list.appendChild(row);
    }

    if (shown === 0 && filter) {
      const empty = document.createElement("div");
      empty.className = "mib-modal-empty";
      empty.textContent = "No MIBs match the filter.";
      list.appendChild(empty);
    }
  }

  modal.appendChild(header);
  modal.appendChild(controls);
  modal.appendChild(status);
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
  filterInput.focus();
}
