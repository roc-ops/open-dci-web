/**
 * Deep-link navigation — scrolls to and highlights lines or TLV paths
 * specified via URL hash parameters.
 *
 * Supported hash parameters:
 *   &line=15          — scroll to and highlight line 15
 *   &highlight=12-18  — highlight a range of lines (12 through 18)
 *   &tlv=Path.To.Prop — find the JSON path, map to lines, scroll & highlight
 *
 * These combine with any content-loading method (#config=, #file=, #gist=, #url=).
 */
import * as monaco from "monaco-editor";
import { parseTree, findNodeAtLocation } from "jsonc-parser";
import { getHashParam } from "./hash-params";
import { showToast } from "../ui/toast";

/** CSS class name used for the line highlight decoration. */
const HIGHLIGHT_CLASS = "deep-link-highlight";

/**
 * Parse a dot-separated TLV path into JSON path segments.
 * Numeric segments are converted to numbers (for array indices).
 *
 * Example: "DownstreamServiceFlow.0.MaxSustainedTrafficRate"
 *       -> ["DownstreamServiceFlow", 0, "MaxSustainedTrafficRate"]
 */
function parseTlvPath(path: string): (string | number)[] {
  return path.split(".").map((segment) => {
    const num = Number(segment);
    return Number.isInteger(num) && segment === String(num) ? num : segment;
  });
}

/**
 * Create a decoration collection that highlights a range of lines
 * with a subtle background color.
 */
function highlightLines(
  editor: monaco.editor.IStandaloneCodeEditor,
  startLine: number,
  endLine: number,
): void {
  const model = editor.getModel();
  if (!model) return;

  // Clamp lines to valid range
  const lineCount = model.getLineCount();
  const clampedStart = Math.max(1, Math.min(startLine, lineCount));
  const clampedEnd = Math.max(clampedStart, Math.min(endLine, lineCount));

  // Create a full-line highlight decoration
  editor.createDecorationsCollection([
    {
      range: new monaco.Range(clampedStart, 1, clampedEnd, 1),
      options: {
        isWholeLine: true,
        className: HIGHLIGHT_CLASS,
        stickiness:
          monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      },
    },
  ]);

  // Scroll to the start of the highlighted range
  editor.revealLineInCenter(clampedStart);

  // Set cursor to the start line
  editor.setPosition({ lineNumber: clampedStart, column: 1 });
}

/**
 * Reads URL hash parameters (`line`, `highlight`, `tlv`) and applies
 * the appropriate Monaco navigation and highlighting.
 *
 * Call this function **after** content has been loaded into the editor.
 */
export function applyDeepLink(
  editor: monaco.editor.IStandaloneCodeEditor,
): void {
  // --- &line=N ---
  const lineParam = getHashParam("line");
  if (lineParam) {
    const lineNumber = parseInt(lineParam, 10);
    if (!isNaN(lineNumber) && lineNumber >= 1) {
      highlightLines(editor, lineNumber, lineNumber);
      return;
    }
  }

  // --- &highlight=M-N ---
  const highlightParam = getHashParam("highlight");
  if (highlightParam) {
    const match = highlightParam.match(/^(\d+)-(\d+)$/);
    if (match) {
      const startLine = parseInt(match[1], 10);
      const endLine = parseInt(match[2], 10);
      if (!isNaN(startLine) && !isNaN(endLine) && startLine >= 1) {
        highlightLines(editor, startLine, endLine);
        return;
      }
    }
  }

  // --- &tlv=Path.To.Property ---
  const tlvParam = getHashParam("tlv");
  if (tlvParam) {
    const model = editor.getModel();
    if (!model) return;

    const text = model.getValue();
    const root = parseTree(text);
    if (!root) {
      showToast(`Could not parse document to locate TLV path: ${tlvParam}`, "warning");
      return;
    }

    const segments = parseTlvPath(tlvParam);
    const node = findNodeAtLocation(root, segments);
    if (!node) {
      showToast(`TLV path not found: ${tlvParam}`, "warning");
      return;
    }

    // Convert character offset to line/column positions
    const startPos = model.getPositionAt(node.offset);
    const endPos = model.getPositionAt(node.offset + node.length);

    highlightLines(editor, startPos.lineNumber, endPos.lineNumber);
  }
}
