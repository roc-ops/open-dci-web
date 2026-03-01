/**
 * Toolbar — top bar with file operations and codec actions.
 */
import type { PacketCableVariant } from "../codec/index";
import type { ConfigFormat } from "../examples";
import { EXAMPLE_CONFIGS } from "../examples";

export interface ToolbarCallbacks {
  onOpen: () => void;
  onSave: () => void;
  onShare: () => void;
  onDiffView: () => void;
  onFormat: () => void;
  onEncode: () => void;
  onDecode: () => void;
  onMibManager: () => void;
  onVendorSchemaManager: () => void;
  onThemeToggle: () => void;
  onSettings: () => void;
  onLoadExample: (content: string, name: string, format?: ConfigFormat) => void;
  onFormatChange: (format: ConfigFormat) => void;
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
  /** Set the active config format displayed in the toolbar toggle. */
  setFormat: (format: ConfigFormat) => void;
  /** Returns the current config format. */
  getFormat: () => ConfigFormat;
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
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Editor toolbar");

  const openBtn = createButton("Open", callbacks.onOpen);
  openBtn.setAttribute("aria-label", "Open file");
  const saveBtn = createButton("Save", callbacks.onSave);
  saveBtn.setAttribute("aria-label", "Save file");
  const shareBtn = createButton("Get Link", callbacks.onShare);
  shareBtn.setAttribute("aria-label", "Get shareable link");
  const diffBtn = createButton("Diff", callbacks.onDiffView);
  diffBtn.setAttribute("aria-label", "Compare with another file");
  diffBtn.title = "Compare current editor content with another file";
  const formatBtn = createButton("Format", callbacks.onFormat);
  formatBtn.setAttribute("aria-label", "Format document");
  formatBtn.title = "Format document (Shift+Alt+F)";
  const encodeBtn = createButton("Encode", callbacks.onEncode, true);
  encodeBtn.setAttribute("aria-label", "Encode configuration");
  const decodeBtn = createButton("Decode", callbacks.onDecode, true);
  decodeBtn.setAttribute("aria-label", "Decode configuration");
  const mibsBtn = createButton("MIBs", callbacks.onMibManager, true);
  mibsBtn.setAttribute("aria-label", "Manage MIBs");
  const vendorsBtn = createButton("Vendors", callbacks.onVendorSchemaManager, true);
  vendorsBtn.setAttribute("aria-label", "Manage vendor schemas");

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
  secretToggle.setAttribute("aria-label", "Show or hide secret");
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

  // Examples dropdown
  const examplesDropdown = document.createElement("div");
  examplesDropdown.className = "toolbar-dropdown";

  const examplesBtn = createButton("Examples", () => {
    examplesMenu.classList.toggle("hidden");
  });
  examplesBtn.title = "Load an example DOCSIS configuration";
  examplesBtn.setAttribute("aria-label", "Load example configuration");

  const examplesMenu = document.createElement("div");
  examplesMenu.className = "toolbar-dropdown-menu hidden";

  for (const example of EXAMPLE_CONFIGS) {
    const item = document.createElement("button");
    item.className = "toolbar-dropdown-item";
    item.type = "button";

    const nameSpan = document.createElement("span");
    nameSpan.className = "toolbar-dropdown-item-name";
    nameSpan.textContent = example.name;

    const descSpan = document.createElement("span");
    descSpan.className = "toolbar-dropdown-item-desc";
    descSpan.textContent = example.description;

    item.appendChild(nameSpan);
    item.appendChild(descSpan);

    item.addEventListener("click", () => {
      examplesMenu.classList.add("hidden");
      callbacks.onLoadExample(example.content, example.name, example.format);
    });

    examplesMenu.appendChild(item);
  }

  examplesDropdown.appendChild(examplesBtn);
  examplesDropdown.appendChild(examplesMenu);

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!examplesDropdown.contains(e.target as Node)) {
      examplesMenu.classList.add("hidden");
    }
  });

  const fileGroup = document.createElement("div");
  fileGroup.className = "toolbar-group";
  fileGroup.appendChild(openBtn);
  fileGroup.appendChild(saveBtn);
  fileGroup.appendChild(shareBtn);
  fileGroup.appendChild(diffBtn);
  fileGroup.appendChild(formatBtn);
  fileGroup.appendChild(examplesDropdown);

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

  // Config format toggle (CM / MTA)
  let currentFormat: ConfigFormat = "cm";
  const cfgFormatBtn = createButton("CM", () => {
    const next: ConfigFormat = currentFormat === "cm" ? "mta" : "cm";
    setFormat(next);
    callbacks.onFormatChange(next);
  });
  cfgFormatBtn.className = "toolbar-btn toolbar-format-btn";
  cfgFormatBtn.title = "Switch between CM (Cable Modem) and MTA (PacketCable) config schemas";
  cfgFormatBtn.setAttribute("aria-label", "Config format: CM");

  const cfgFormatGroup = document.createElement("div");
  cfgFormatGroup.className = "toolbar-group";
  cfgFormatGroup.appendChild(cfgFormatBtn);

  const codecGroup = document.createElement("div");
  codecGroup.className = "toolbar-group";
  codecGroup.appendChild(encodeBtn);
  codecGroup.appendChild(decodeBtn);

  const mibGroup = document.createElement("div");
  mibGroup.className = "toolbar-group";
  mibGroup.appendChild(mibsBtn);
  mibGroup.appendChild(vendorsBtn);

  // Use indirect dispatch so late-bound callbacks work after reassignment
  const themeBtn = createButton("Light", () => callbacks.onThemeToggle());
  themeBtn.title = "Toggle light/dark theme";
  themeBtn.setAttribute("aria-label", "Toggle light/dark theme");

  const settingsBtn = createButton("Settings", () => callbacks.onSettings());
  settingsBtn.title = "Editor settings";
  settingsBtn.setAttribute("aria-label", "Editor settings");

  const themeGroup = document.createElement("div");
  themeGroup.className = "toolbar-group";
  themeGroup.appendChild(themeBtn);
  themeGroup.appendChild(settingsBtn);

  toolbar.appendChild(title);
  toolbar.appendChild(fileGroup);
  toolbar.appendChild(cfgFormatGroup);
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

  function setFormat(format: ConfigFormat): void {
    currentFormat = format;
    cfgFormatBtn.textContent = format.toUpperCase();
    cfgFormatBtn.setAttribute("aria-label", `Config format: ${format.toUpperCase()}`);
  }

  function getFormat(): ConfigFormat {
    return currentFormat;
  }

  return {
    toolbar,
    setCodecReady,
    getSecret: () => secretInput.value,
    setPacketCable,
    getPacketCableVariant,
    updateThemeButton,
    setFormat,
    getFormat,
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
