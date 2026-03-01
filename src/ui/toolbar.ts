/**
 * Toolbar — top bar with file operations and codec actions.
 */
import type { PacketCableVariant } from "../codec/index";

export interface ToolbarCallbacks {
  onOpen: () => void;
  onSave: () => void;
  onShare: () => void;
  onFormat: () => void;
  onEncode: () => void;
  onDecode: () => void;
  onMibManager: () => void;
  onVendorSchemaManager: () => void;
  onThemeToggle: () => void;
}

export interface ToolbarResult {
  toolbar: HTMLElement;
  /** Call when WASM codec becomes ready (or fails). */
  setCodecReady: (ready: boolean, error?: string) => void;
  /** Returns the current CMTS shared-secret value (empty string if not set). */
  getSecret: () => string;
  /** Show or hide the PacketCable hash controls based on config type detection. */
  setPacketCable: (visible: boolean) => void;
  /** Returns the selected PacketCable hash variant, or undefined if not enabled. */
  getPacketCableVariant: () => PacketCableVariant | undefined;
  /** Update the theme toggle button label to reflect the current theme. */
  updateThemeButton: (currentTheme: "dark" | "light") => void;
}

/**
 * Creates the toolbar element and appends it to the container.
 * Encode/decode/MIBs buttons start disabled until setCodecReady(true) is called.
 */
export function createToolbar(
  container: HTMLElement,
  callbacks: ToolbarCallbacks,
): ToolbarResult {
  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";

  const openBtn = createButton("Open", callbacks.onOpen);
  const saveBtn = createButton("Save", callbacks.onSave);
  const shareBtn = createButton("Get Link", callbacks.onShare);
  const formatBtn = createButton("Format", callbacks.onFormat);
  formatBtn.title = "Format document (Shift+Alt+F)";
  const encodeBtn = createButton("Encode", callbacks.onEncode, true);
  const decodeBtn = createButton("Decode", callbacks.onDecode, true);
  const mibsBtn = createButton("MIBs", callbacks.onMibManager, true);
  const vendorsBtn = createButton("Vendors", callbacks.onVendorSchemaManager, true);

  encodeBtn.title = "WASM codec is loading\u2026";
  decodeBtn.title = "WASM codec is loading\u2026";
  mibsBtn.title = "WASM codec is loading\u2026";
  vendorsBtn.title = "WASM codec is loading\u2026";

  const secretInput = document.createElement("input");
  secretInput.type = "password";
  secretInput.className = "toolbar-secret";
  secretInput.placeholder = "CMTS Secret";
  secretInput.title = "CMTS shared-secret for MIC computation (optional)";

  const secretToggle = document.createElement("button");
  secretToggle.className = "toolbar-secret-toggle";
  secretToggle.type = "button";
  secretToggle.textContent = "\u{1F441}";
  secretToggle.title = "Show/hide secret";
  secretToggle.addEventListener("click", () => {
    const hidden = secretInput.type === "password";
    secretInput.type = hidden ? "text" : "password";
    secretToggle.classList.toggle("toolbar-secret-toggle-active", hidden);
  });

  // PacketCable hash controls
  const pcCheckbox = document.createElement("input");
  pcCheckbox.type = "checkbox";
  pcCheckbox.id = "pc-hash-checkbox";
  pcCheckbox.className = "toolbar-pc-checkbox";
  pcCheckbox.title = "Enable PacketCable hash for MTA config";

  const pcLabel = document.createElement("label");
  pcLabel.htmlFor = "pc-hash-checkbox";
  pcLabel.className = "toolbar-pc-label";
  pcLabel.textContent = "PC Hash";

  const pcSelect = document.createElement("select");
  pcSelect.className = "toolbar-pc-select";
  pcSelect.title = "PacketCable hash variant";
  for (const v of ["NA", "EU", "IETF"] as const) {
    const opt = document.createElement("option");
    opt.value = v.toLowerCase();
    opt.textContent = v;
    pcSelect.appendChild(opt);
  }
  pcSelect.disabled = true;

  pcCheckbox.addEventListener("change", () => {
    pcSelect.disabled = !pcCheckbox.checked;
  });

  const title = document.createElement("span");
  title.className = "toolbar-title";
  const openDciLink = document.createElement("a");
  openDciLink.href = "https://github.com/roc-ops/open-dci";
  openDciLink.target = "_blank";
  openDciLink.rel = "noopener";
  openDciLink.textContent = "OpenDCI";
  const editorLink = document.createElement("a");
  editorLink.href = "https://github.com/roc-ops/open-dci-web";
  editorLink.target = "_blank";
  editorLink.rel = "noopener";
  editorLink.textContent = "Config Editor";
  title.appendChild(openDciLink);
  title.appendChild(document.createTextNode(" "));
  title.appendChild(editorLink);

  const fileGroup = document.createElement("div");
  fileGroup.className = "toolbar-group";
  fileGroup.appendChild(openBtn);
  fileGroup.appendChild(saveBtn);
  fileGroup.appendChild(shareBtn);
  fileGroup.appendChild(formatBtn);

  const secretGroup = document.createElement("div");
  secretGroup.className = "toolbar-group";
  secretGroup.appendChild(secretInput);
  secretGroup.appendChild(secretToggle);

  const pcGroup = document.createElement("div");
  pcGroup.className = "toolbar-group toolbar-pc-group";
  pcGroup.style.display = "none";
  pcGroup.appendChild(pcCheckbox);
  pcGroup.appendChild(pcLabel);
  pcGroup.appendChild(pcSelect);

  const codecGroup = document.createElement("div");
  codecGroup.className = "toolbar-group";
  codecGroup.appendChild(encodeBtn);
  codecGroup.appendChild(decodeBtn);

  const mibGroup = document.createElement("div");
  mibGroup.className = "toolbar-group";
  mibGroup.appendChild(mibsBtn);
  mibGroup.appendChild(vendorsBtn);

  const themeBtn = createButton("Light", callbacks.onThemeToggle);
  themeBtn.title = "Toggle light/dark theme";

  const themeGroup = document.createElement("div");
  themeGroup.className = "toolbar-group";
  themeGroup.appendChild(themeBtn);

  toolbar.appendChild(title);
  toolbar.appendChild(fileGroup);
  toolbar.appendChild(secretGroup);
  toolbar.appendChild(pcGroup);
  toolbar.appendChild(codecGroup);
  toolbar.appendChild(mibGroup);
  toolbar.appendChild(themeGroup);
  container.appendChild(toolbar);

  function setCodecReady(ready: boolean, error?: string): void {
    encodeBtn.disabled = !ready;
    decodeBtn.disabled = !ready;
    mibsBtn.disabled = !ready;
    vendorsBtn.disabled = !ready;
    if (ready) {
      encodeBtn.title = "";
      decodeBtn.title = "";
      mibsBtn.title = "";
      vendorsBtn.title = "";
    } else {
      const msg = error
        ? `WASM codec failed to load: ${error}`
        : "WASM codec is loading\u2026";
      encodeBtn.title = msg;
      decodeBtn.title = msg;
      mibsBtn.title = msg;
      vendorsBtn.title = msg;
    }
  }

  function setPacketCable(visible: boolean): void {
    pcGroup.style.display = visible ? "flex" : "none";
    if (!visible) {
      pcCheckbox.checked = false;
      pcSelect.disabled = true;
    }
  }

  function getPacketCableVariant(): PacketCableVariant | undefined {
    if (pcGroup.style.display === "none" || !pcCheckbox.checked) return undefined;
    return pcSelect.value as PacketCableVariant;
  }

  function updateThemeButton(currentTheme: "dark" | "light"): void {
    // Show the opposite theme name so the user knows what clicking will switch to
    themeBtn.textContent = currentTheme === "dark" ? "Light" : "Dark";
  }

  return {
    toolbar,
    setCodecReady,
    getSecret: () => secretInput.value,
    setPacketCable,
    getPacketCableVariant,
    updateThemeButton,
  };
}

function createButton(
  label: string,
  onClick: () => void,
  disabled = false,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "toolbar-btn";
  btn.textContent = label;
  btn.disabled = disabled;
  if (disabled) btn.title = "Coming soon";
  btn.addEventListener("click", onClick);
  return btn;
}
