/**
 * Hex Input Modal — for editing large hex strings used in chunked TLV
 * properties (ManufacturerCvc, CoSignerCvc, etc.).
 *
 * In "edit" mode, opens with the existing hex value pre-populated.
 * In "add" mode, shows a dropdown of available (not-yet-present) property names.
 * The normalized hex string is stored as a single JSON property value — the
 * WASM encoder handles the actual wire chunking.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HexInputOptions {
  mode: "add" | "edit";
  /** Property name (required for edit mode). */
  propertyName?: string;
  /** Existing hex value to pre-populate (edit mode). */
  existingValue?: string;
  /** Available property names for the dropdown (add mode). */
  availableProperties?: string[];
  /** Called when the user clicks Save with a valid hex string. */
  onSave: (propertyName: string, hexValue: string) => void;
}

// ---------------------------------------------------------------------------
// Hex helpers
// ---------------------------------------------------------------------------

/** Strip whitespace, colons, dashes, and line breaks from a hex string. */
function normalizeHex(raw: string): string {
  return raw.replace(/[\s:\-]/g, "").toUpperCase();
}

/** Validate a normalized hex string. Returns an error message or null. */
function validateHex(hex: string): string | null {
  if (hex.length === 0) return null; // empty is not an error, just no data
  if (/[^0-9A-F]/i.test(hex)) return "Invalid characters — only hex digits (0-9, A-F) are allowed.";
  if (hex.length % 2 !== 0) return "Odd number of hex characters — hex strings must have an even length.";
  return null;
}

/** Format a byte count with thousands separators. */
function formatNumber(n: number): string {
  return n.toLocaleString();
}

// ---------------------------------------------------------------------------
// Modal UI
// ---------------------------------------------------------------------------

export function showHexInput(container: HTMLElement, options: HexInputOptions): void {
  // Remove any existing hex-input modal
  const existing = container.querySelector(".hex-input-backdrop");
  if (existing) existing.remove();

  // --- Backdrop ---
  const backdrop = document.createElement("div");
  backdrop.className = "hex-input-backdrop";

  const modal = document.createElement("div");
  modal.className = "hex-input-modal";

  // --- Header ---
  const header = document.createElement("div");
  header.className = "hex-input-header";

  const titleEl = document.createElement("span");
  titleEl.className = "hex-input-title";
  if (options.mode === "edit" && options.propertyName) {
    titleEl.textContent = `Edit ${options.propertyName}`;
  } else {
    titleEl.textContent = "Add Chunked TLV";
  }

  const closeBtn = document.createElement("button");
  closeBtn.className = "hex-input-close";
  closeBtn.textContent = "\u00d7";
  closeBtn.addEventListener("click", () => close());

  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  // --- Body ---
  const body = document.createElement("div");
  body.className = "hex-input-body";

  // Property selector (add mode only)
  let selectEl: HTMLSelectElement | null = null;
  if (options.mode === "add" && options.availableProperties && options.availableProperties.length > 0) {
    const selectGroup = document.createElement("div");
    selectGroup.className = "hex-input-select-group";

    const selectLabel = document.createElement("label");
    selectLabel.className = "hex-input-label";
    selectLabel.textContent = "Property";

    selectEl = document.createElement("select");
    selectEl.className = "hex-input-select";
    for (const name of options.availableProperties) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      selectEl.appendChild(opt);
    }

    selectGroup.appendChild(selectLabel);
    selectGroup.appendChild(selectEl);
    body.appendChild(selectGroup);
  }

  // Textarea
  const textareaLabel = document.createElement("label");
  textareaLabel.className = "hex-input-label";
  textareaLabel.textContent = "Hex String";

  const textarea = document.createElement("textarea");
  textarea.className = "hex-input-textarea";
  textarea.placeholder = "Paste hex string...";
  textarea.spellcheck = false;
  if (options.existingValue) {
    textarea.value = options.existingValue;
  }

  body.appendChild(textareaLabel);
  body.appendChild(textarea);

  // Info line
  const infoEl = document.createElement("div");
  infoEl.className = "hex-input-info";
  body.appendChild(infoEl);

  // Error line
  const errorEl = document.createElement("div");
  errorEl.className = "hex-input-error";
  body.appendChild(errorEl);

  // --- Footer ---
  const footer = document.createElement("div");
  footer.className = "hex-input-footer";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "toolbar-btn hex-input-cancel-btn";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => close());

  const saveBtn = document.createElement("button");
  saveBtn.className = "toolbar-btn hex-input-save-btn";
  saveBtn.textContent = "Save";
  saveBtn.disabled = true;
  saveBtn.addEventListener("click", () => {
    const normalized = normalizeHex(textarea.value);
    const err = validateHex(normalized);
    if (err || normalized.length === 0) return;

    let propertyName: string;
    if (options.mode === "edit") {
      propertyName = options.propertyName!;
    } else {
      propertyName = selectEl ? selectEl.value : (options.availableProperties?.[0] ?? "");
    }

    options.onSave(propertyName, normalized);
    close();
  });

  footer.appendChild(cancelBtn);
  footer.appendChild(saveBtn);

  // --- Assemble modal ---
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

  // --- Live validation & info ---
  function updateInfo(): void {
    const normalized = normalizeHex(textarea.value);
    const err = validateHex(normalized);

    if (err) {
      errorEl.textContent = err;
      errorEl.style.display = "";
      infoEl.style.display = "none";
      saveBtn.disabled = true;
      return;
    }

    errorEl.textContent = "";
    errorEl.style.display = "none";

    if (normalized.length === 0) {
      infoEl.textContent = "";
      infoEl.style.display = "none";
      saveBtn.disabled = true;
      return;
    }

    const byteCount = normalized.length / 2;
    const chunkSize = 254;
    const chunkCount = Math.ceil(byteCount / chunkSize);

    let text = `${formatNumber(byteCount)} bytes`;
    if (chunkCount > 1) {
      text += ` \u2014 ${chunkCount} TLV chunks of \u2264${chunkSize} bytes`;
    }
    infoEl.textContent = text;
    infoEl.style.display = "";
    saveBtn.disabled = false;
  }

  textarea.addEventListener("input", updateInfo);

  // Initial update
  updateInfo();

  // Focus the textarea
  textarea.focus();
}
