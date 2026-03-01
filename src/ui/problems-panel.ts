/**
 * Problems panel — collapsible panel below the editor that lists all Monaco
 * markers (errors, warnings, info) with clickable navigation.
 */
import * as monaco from "monaco-editor";

export function createProblemsPanel(
  container: HTMLElement,
  editor: monaco.editor.IStandaloneCodeEditor,
): { element: HTMLElement; toggle: () => void } {
  const panel = document.createElement("div");
  panel.className = "problems-panel";

  const list = document.createElement("div");
  list.className = "problems-list";
  panel.appendChild(list);

  // Insert the panel into the container. It will be placed just before the
  // status bar in main.ts (between the editor-container and the status-bar).
  container.appendChild(panel);

  /** Severity sort order: errors first, then warnings, then info/hint. */
  function severityOrder(s: monaco.MarkerSeverity): number {
    switch (s) {
      case monaco.MarkerSeverity.Error:
        return 0;
      case monaco.MarkerSeverity.Warning:
        return 1;
      case monaco.MarkerSeverity.Info:
        return 2;
      default:
        return 3;
    }
  }

  function severityColor(s: monaco.MarkerSeverity): string {
    switch (s) {
      case monaco.MarkerSeverity.Error:
        return "var(--color-error)";
      case monaco.MarkerSeverity.Warning:
        return "var(--color-warning)";
      default:
        return "var(--color-accent)";
    }
  }

  function render(markers: monaco.editor.IMarker[]): void {
    list.innerHTML = "";

    if (markers.length === 0) {
      const empty = document.createElement("div");
      empty.className = "problems-panel-empty";
      empty.textContent = "No problems";
      list.appendChild(empty);
      return;
    }

    // Sort: errors first, then warnings, then info; within same severity by line
    const sorted = [...markers].sort((a, b) => {
      const so = severityOrder(a.severity) - severityOrder(b.severity);
      if (so !== 0) return so;
      const lr = a.startLineNumber - b.startLineNumber;
      if (lr !== 0) return lr;
      return a.startColumn - b.startColumn;
    });

    for (const marker of sorted) {
      const row = document.createElement("div");
      row.className = "problems-item";

      const icon = document.createElement("span");
      icon.className = "problems-severity";
      icon.textContent = "\u25CF";
      icon.style.color = severityColor(marker.severity);

      const message = document.createElement("span");
      message.className = "problems-message";
      message.textContent = marker.message;
      message.title = marker.message;

      const location = document.createElement("span");
      location.className = "problems-location";
      location.textContent = `Ln ${marker.startLineNumber}, Col ${marker.startColumn}`;

      row.appendChild(icon);
      row.appendChild(message);
      row.appendChild(location);

      row.addEventListener("click", () => {
        const pos = {
          lineNumber: marker.startLineNumber,
          column: marker.startColumn,
        };
        editor.setPosition(pos);
        editor.revealLineInCenter(marker.startLineNumber);
        editor.focus();
      });

      list.appendChild(row);
    }
  }

  // Subscribe to marker changes
  monaco.editor.onDidChangeMarkers(([uri]) => {
    const model = editor.getModel();
    if (!model || model.uri.toString() !== uri.toString()) return;
    const markers = monaco.editor.getModelMarkers({ resource: uri });
    render(markers);
  });

  // Initial render
  const model = editor.getModel();
  if (model) {
    const markers = monaco.editor.getModelMarkers({
      resource: model.uri,
    });
    render(markers);
  } else {
    render([]);
  }

  function toggle(): void {
    panel.classList.toggle("open");
  }

  return { element: panel, toggle };
}
