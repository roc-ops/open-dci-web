/**
 * CVC Extract Result Modal — confirmation dialog shown after extracting
 * CVC certificates from a firmware file.  Lists each found certificate
 * with its byte count, indicates whether it will replace an existing
 * field, and lets the user Apply or Cancel.
 *
 * Follows the same DOM construction pattern as src/ui/hex-input.ts:
 * backdrop -> modal -> header -> body -> footer.
 * CSS class prefix: `.cvc-extract-`.
 */

import type { ExtractCVCResult } from "../codec/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Info about a single CVC field to display in the confirmation list. */
export interface CvcFieldInfo {
  /** Property name (e.g. "ManufacturerCvc"). */
  name: string;
  /** Hex string value extracted from firmware. */
  hexValue: string;
  /** Whether this property already exists in the editor document. */
  existsInDocument: boolean;
}

export interface CvcExtractResultOptions {
  /** Parsed extraction result — only non-null fields are shown. */
  result: ExtractCVCResult;
  /** Set of property names already present in the document. */
  existingNames: Set<string>;
  /** Original firmware filename (e.g. "firmware.bin"). */
  firmwareFilename?: string;
  /** Called when the user clicks Apply.  Receives the firmware filename so the caller can set SwUpgradeFilename. */
  onApply: (fields: CvcFieldInfo[], firmwareFilename?: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a byte count with thousands separators. */
function formatBytes(hex: string): string {
  const bytes = hex.length / 2;
  return `${bytes.toLocaleString()} bytes`;
}

// ---------------------------------------------------------------------------
// Modal UI
// ---------------------------------------------------------------------------

/**
 * Show a confirmation modal listing the CVC certificates extracted from
 * a firmware file.  The user can review which fields will be populated
 * (and which will replace existing values) before clicking Apply.
 */
export function showCvcExtractResult(
  container: HTMLElement,
  options: CvcExtractResultOptions,
): void {
  // Remove any existing modal
  const existing = container.querySelector(".cvc-extract-backdrop");
  if (existing) existing.remove();

  // Build the list of non-null fields
  const CVC_KEYS: (keyof ExtractCVCResult)[] = [
    "ManufacturerCvc",
    "CoSignerCvc",
    "ManufacturerCvcChain",
    "CoSignerCvcChain",
  ];

  const fields: CvcFieldInfo[] = [];
  for (const key of CVC_KEYS) {
    const val = options.result[key];
    if (val) {
      fields.push({
        name: key,
        hexValue: val,
        existsInDocument: options.existingNames.has(key),
      });
    }
  }

  // --- Backdrop ---
  const backdrop = document.createElement("div");
  backdrop.className = "cvc-extract-backdrop";

  const modal = document.createElement("div");
  modal.className = "cvc-extract-modal";

  // --- Header ---
  const header = document.createElement("div");
  header.className = "cvc-extract-header";

  const titleEl = document.createElement("span");
  titleEl.className = "cvc-extract-title";
  titleEl.textContent = "Extracted CVC Certificates";

  const closeBtn = document.createElement("button");
  closeBtn.className = "cvc-extract-close";
  closeBtn.textContent = "\u00d7";
  closeBtn.addEventListener("click", () => close());

  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  // --- Body ---
  const body = document.createElement("div");
  body.className = "cvc-extract-body";

  const description = document.createElement("div");
  description.className = "cvc-extract-description";
  description.textContent =
    `Found ${fields.length} certificate${fields.length === 1 ? "" : "s"}. Click Apply to populate the editor fields.`;
  body.appendChild(description);

  const list = document.createElement("div");
  list.className = "cvc-extract-list";

  for (const field of fields) {
    const row = document.createElement("div");
    row.className = "cvc-extract-row";

    const nameEl = document.createElement("span");
    nameEl.className = "cvc-extract-field-name";
    nameEl.textContent = field.name;

    const bytesEl = document.createElement("span");
    bytesEl.className = "cvc-extract-field-bytes";
    bytesEl.textContent = formatBytes(field.hexValue);

    row.appendChild(nameEl);
    row.appendChild(bytesEl);

    if (field.existsInDocument) {
      const replaceEl = document.createElement("span");
      replaceEl.className = "cvc-extract-field-replace";
      replaceEl.textContent = "(will replace existing)";
      row.appendChild(replaceEl);
    }

    list.appendChild(row);
  }

  body.appendChild(list);

  // SwUpgradeFilename notice
  if (options.firmwareFilename) {
    const filenameNotice = document.createElement("div");
    filenameNotice.className = "cvc-extract-filename-notice";
    filenameNotice.textContent =
      `SwUpgradeFilename will be set to: ${options.firmwareFilename}`;
    body.appendChild(filenameNotice);
  }

  // --- Footer ---
  const footer = document.createElement("div");
  footer.className = "cvc-extract-footer";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "toolbar-btn cvc-extract-cancel-btn";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => close());

  const applyBtn = document.createElement("button");
  applyBtn.className = "toolbar-btn cvc-extract-apply-btn";
  applyBtn.textContent = "Apply";
  applyBtn.addEventListener("click", () => {
    options.onApply(fields, options.firmwareFilename);
    close();
  });

  footer.appendChild(cancelBtn);
  footer.appendChild(applyBtn);

  // --- Assemble ---
  modal.appendChild(header);
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
}
