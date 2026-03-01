/**
 * Diff View — fullscreen Monaco diff editor overlay.
 *
 * Lets the user pick a file and compare it side-by-side with the
 * current editor content using Monaco's built-in diff editor.
 */
import * as monaco from "monaco-editor";
import { pickFiles } from "../file/pick-files";

/**
 * Prompts the user to select a file, then opens a fullscreen diff
 * overlay comparing the selected file (original / left) against the
 * current editor content (modified / right).
 */
export function showDiffView(
  container: HTMLElement,
  editor: monaco.editor.IStandaloneCodeEditor,
): void {
  pickFiles({ accept: ".json,.jsonc,.txt,.cm,.bin,.cfg" })
    .then((files) => {
      const file = files[0];
      if (!file) return;

      file.text().then((originalText) => {
        openDiffOverlay(container, editor, originalText, file.name);
      });
    })
    .catch(() => {
      // User cancelled — nothing to do
    });
}

/** Current theme name used by the main editor. */
function getCurrentTheme(): string {
  const theme = document.documentElement.dataset.theme;
  return theme === "light" ? "opendci-light" : "opendci-dark";
}

/**
 * Creates the fullscreen diff overlay, diff editor, and wires up
 * the close button.
 */
function openDiffOverlay(
  container: HTMLElement,
  editor: monaco.editor.IStandaloneCodeEditor,
  originalText: string,
  originalFileName: string,
): void {
  // --- Models ---
  const originalModel = monaco.editor.createModel(originalText, "json");
  const modifiedModel = monaco.editor.createModel(editor.getValue(), "json");

  // --- Overlay ---
  const overlay = document.createElement("div");
  overlay.className = "diff-overlay";

  // --- Header ---
  const header = document.createElement("div");
  header.className = "diff-header";

  const titleLeft = document.createElement("span");
  titleLeft.className = "diff-title";
  titleLeft.textContent = originalFileName;

  const titleRight = document.createElement("span");
  titleRight.className = "diff-title";
  titleRight.textContent = "Current Editor";

  const closeBtn = document.createElement("button");
  closeBtn.className = "diff-close-btn toolbar-btn";
  closeBtn.type = "button";
  closeBtn.textContent = "Close Diff";

  header.appendChild(titleLeft);
  header.appendChild(titleRight);
  header.appendChild(closeBtn);

  // --- Diff editor container ---
  const diffContainer = document.createElement("div");
  diffContainer.className = "diff-container";

  overlay.appendChild(header);
  overlay.appendChild(diffContainer);
  container.appendChild(overlay);

  // --- Diff editor ---
  const diffEditor = monaco.editor.createDiffEditor(diffContainer, {
    automaticLayout: true,
    readOnly: true,
    theme: getCurrentTheme(),
    renderSideBySide: true,
    scrollBeyondLastLine: false,
  });

  diffEditor.setModel({
    original: originalModel,
    modified: modifiedModel,
  });

  // --- Close handler ---
  function closeDiff(): void {
    diffEditor.dispose();
    originalModel.dispose();
    modifiedModel.dispose();
    overlay.remove();
    document.removeEventListener("keydown", onKeyDown);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      closeDiff();
    }
  }

  closeBtn.addEventListener("click", closeDiff);
  document.addEventListener("keydown", onKeyDown);
}
