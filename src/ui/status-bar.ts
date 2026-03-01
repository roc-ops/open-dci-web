/**
 * Status bar — displays validation error count, cursor position, and file info.
 */
import * as monaco from "monaco-editor";

/**
 * Creates the status bar element and wires it to editor events.
 */
export function createStatusBar(
  container: HTMLElement,
  editor: monaco.editor.IStandaloneCodeEditor,
): HTMLElement {
  const statusBar = document.createElement("div");
  statusBar.className = "status-bar";

  const errorsSpan = document.createElement("span");
  errorsSpan.className = "status-errors";
  errorsSpan.textContent = "No errors";

  const cursorSpan = document.createElement("span");
  cursorSpan.className = "status-cursor";
  cursorSpan.textContent = "Ln 1, Col 1";

  const fileSpan = document.createElement("span");
  fileSpan.className = "status-file";
  fileSpan.textContent = "untitled.jsonc";

  statusBar.appendChild(errorsSpan);
  statusBar.appendChild(fileSpan);
  statusBar.appendChild(cursorSpan);
  container.appendChild(statusBar);

  // Subscribe to marker changes for error count
  monaco.editor.onDidChangeMarkers(([uri]) => {
    const model = editor.getModel();
    if (!model || model.uri.toString() !== uri.toString()) return;
    const markers = monaco.editor.getModelMarkers({ resource: uri });
    const errorCount = markers.filter(
      (m) => m.severity === monaco.MarkerSeverity.Error,
    ).length;
    const warningCount = markers.filter(
      (m) => m.severity === monaco.MarkerSeverity.Warning,
    ).length;

    if (errorCount === 0 && warningCount === 0) {
      errorsSpan.textContent = "No errors";
      errorsSpan.className = "status-errors status-ok";
    } else {
      const parts: string[] = [];
      if (errorCount > 0) parts.push(`${errorCount} error${errorCount !== 1 ? "s" : ""}`);
      if (warningCount > 0) parts.push(`${warningCount} warning${warningCount !== 1 ? "s" : ""}`);
      errorsSpan.textContent = parts.join(", ");
      errorsSpan.className = errorCount > 0 ? "status-errors status-error" : "status-errors status-warning";
    }
  });

  // Subscribe to cursor position changes
  editor.onDidChangeCursorPosition((e) => {
    cursorSpan.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
  });

  return statusBar;
}

/** Updates the file name displayed in the status bar. */
export function setStatusFileName(
  statusBar: HTMLElement,
  name: string,
): void {
  const fileSpan = statusBar.querySelector(".status-file");
  if (fileSpan) fileSpan.textContent = name;
}

/** Shows or hides the dirty indicator (modified dot) next to the filename. */
export function setStatusDirty(
  statusBar: HTMLElement,
  dirty: boolean,
): void {
  statusBar.classList.toggle("status-dirty", dirty);
}
