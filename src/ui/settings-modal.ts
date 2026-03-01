/**
 * Settings modal — lets the user configure editor preferences
 * (font size, tab size, word wrap, minimap) with live preview and
 * localStorage persistence.
 */
import * as monaco from "monaco-editor";
import { createModal } from "./modal";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "opendci-settings";

interface EditorSettings {
  fontSize: number;
  tabSize: number;
  wordWrap: "on" | "off";
  minimap: boolean;
}

const DEFAULTS: EditorSettings = {
  fontSize: 14,
  tabSize: 2,
  wordWrap: "on",
  minimap: true,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadSettings(): EditorSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<EditorSettings>;
      return {
        fontSize: clampNumber(parsed.fontSize, 10, 30, DEFAULTS.fontSize),
        tabSize: clampNumber(parsed.tabSize, 2, 8, DEFAULTS.tabSize),
        wordWrap: parsed.wordWrap === "off" ? "off" : "on",
        minimap: typeof parsed.minimap === "boolean" ? parsed.minimap : DEFAULTS.minimap,
      };
    }
  } catch {
    // Corrupted or missing — fall through to defaults
  }
  return { ...DEFAULTS };
}

function saveSettings(settings: EditorSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function applyToEditor(
  editor: monaco.editor.IStandaloneCodeEditor,
  settings: EditorSettings,
): void {
  editor.updateOptions({
    fontSize: settings.fontSize,
    tabSize: settings.tabSize,
    wordWrap: settings.wordWrap,
    minimap: { enabled: settings.minimap },
  });
  // Also update the tab-size on the model so new indentation matches
  editor.getModel()?.updateOptions({ tabSize: settings.tabSize });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply previously-saved settings (from localStorage) to the editor.
 * Call this once after editor creation so the user's preferences are restored.
 */
export function applyStoredSettings(
  editor: monaco.editor.IStandaloneCodeEditor,
): void {
  const settings = loadSettings();
  applyToEditor(editor, settings);
}

/**
 * Open the settings modal.
 */
export function showSettingsModal(
  container: HTMLElement,
  editor: monaco.editor.IStandaloneCodeEditor,
): void {
  const { modal, body, close } = createModal({
    cssPrefix: "settings",
    title: "Editor Settings",
    container,
  });

  modal.classList.add("settings-modal");

  // --- Build form ---
  const form = document.createElement("div");
  form.className = "settings-form";

  const settings = loadSettings();

  // Persist + apply helper
  const commit = () => {
    saveSettings(settings);
    applyToEditor(editor, settings);
  };

  // Font size
  const fontSizeInput = createNumberRow(form, "Font Size", settings.fontSize, 10, 30);
  fontSizeInput.addEventListener("input", () => {
    const v = parseInt(fontSizeInput.value, 10);
    if (!Number.isNaN(v) && v >= 10 && v <= 30) {
      settings.fontSize = v;
      commit();
    }
  });

  // Tab size
  const tabSizeInput = createNumberRow(form, "Tab Size", settings.tabSize, 2, 8);
  tabSizeInput.addEventListener("input", () => {
    const v = parseInt(tabSizeInput.value, 10);
    if (!Number.isNaN(v) && v >= 2 && v <= 8) {
      settings.tabSize = v;
      commit();
    }
  });

  // Word wrap
  const wordWrapCheckbox = createCheckboxRow(form, "Word Wrap", settings.wordWrap === "on");
  wordWrapCheckbox.addEventListener("change", () => {
    settings.wordWrap = wordWrapCheckbox.checked ? "on" : "off";
    commit();
  });

  // Minimap
  const minimapCheckbox = createCheckboxRow(form, "Minimap", settings.minimap);
  minimapCheckbox.addEventListener("change", () => {
    settings.minimap = minimapCheckbox.checked;
    commit();
  });

  body.appendChild(form);
  modal.appendChild(body);

  // Focus the modal so Escape works immediately
  modal.setAttribute("tabindex", "-1");
  modal.focus();

  // Close on Escape is handled by createModal; we just need to keep a
  // reference so callers could close programmatically if needed.
  void close;
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function createNumberRow(
  parent: HTMLElement,
  label: string,
  value: number,
  min: number,
  max: number,
): HTMLInputElement {
  const row = document.createElement("div");
  row.className = "settings-row";

  const lbl = document.createElement("label");
  lbl.className = "settings-label";
  lbl.textContent = label;

  const input = document.createElement("input");
  input.type = "number";
  input.className = "settings-input";
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);

  row.appendChild(lbl);
  row.appendChild(input);
  parent.appendChild(row);
  return input;
}

function createCheckboxRow(
  parent: HTMLElement,
  label: string,
  checked: boolean,
): HTMLInputElement {
  const row = document.createElement("div");
  row.className = "settings-row";

  const lbl = document.createElement("label");
  lbl.className = "settings-label";
  lbl.textContent = label;

  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "settings-checkbox";
  input.checked = checked;

  row.appendChild(lbl);
  row.appendChild(input);
  parent.appendChild(row);
  return input;
}
