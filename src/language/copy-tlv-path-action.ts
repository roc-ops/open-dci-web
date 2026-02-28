/**
 * Copy TLV Path Action — adds a right-click context menu option
 * to copy the full JSON path at the cursor position to the clipboard.
 *
 * Produces paths like "DownstreamServiceFlow.0.MaxSustainedTrafficRate"
 * suitable for use with the &tlv= deep linking parameter.
 */

import * as monaco from "monaco-editor";
import { getLocation } from "jsonc-parser";
import { showToast } from "../ui/toast";

export function registerCopyTlvPathAction(
  editor: monaco.editor.IStandaloneCodeEditor,
): void {
  editor.addAction({
    id: "docsis-copy-tlv-path",
    label: "Copy TLV Path",
    contextMenuGroupId: "9_cutcopypaste",
    contextMenuOrder: 5,

    run: (ed: monaco.editor.ICodeEditor) => {
      const model = ed.getModel();
      if (!model) return;

      const position = ed.getPosition();
      if (!position) return;

      const text = model.getValue();
      const offset = model.getOffsetAt(position);
      const location = getLocation(text, offset);

      if (!location.path || location.path.length === 0) {
        showToast("No TLV path found at cursor position.", "info");
        return;
      }

      const tlvPath = location.path.map((s) => String(s)).join(".");

      navigator.clipboard.writeText(tlvPath).then(
        () => showToast(`Copied: ${tlvPath}`, "success"),
        () => showToast("Failed to copy path to clipboard.", "error"),
      );
    },
  });
}
