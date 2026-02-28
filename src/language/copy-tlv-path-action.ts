/**
 * TLV Path context menu actions:
 *   - "Copy TLV Path" — copies the dot-separated JSON path at the cursor
 *   - "Get Link for TLV" — copies a full shareable URL with &tlv= deep link
 */

import * as monaco from "monaco-editor";
import { getLocation } from "jsonc-parser";
import { showToast } from "../ui/toast";
import {
  encodeConfig,
  buildHash,
  isShareUrlTooLong,
} from "../sharing";

/** Return the dot-separated TLV path at the cursor, or null. */
function getTlvPathAtCursor(
  editor: monaco.editor.ICodeEditor,
): string | null {
  const model = editor.getModel();
  if (!model) return null;

  const position = editor.getPosition();
  if (!position) return null;

  const text = model.getValue();
  const offset = model.getOffsetAt(position);
  const location = getLocation(text, offset);

  if (!location.path || location.path.length === 0) return null;

  return location.path.map((s) => String(s)).join(".");
}

export function registerCopyTlvPathAction(
  editor: monaco.editor.IStandaloneCodeEditor,
): void {
  editor.addAction({
    id: "docsis-copy-tlv-path",
    label: "Copy TLV Path",
    contextMenuGroupId: "9_cutcopypaste",
    contextMenuOrder: 5,

    run: (ed: monaco.editor.ICodeEditor) => {
      const tlvPath = getTlvPathAtCursor(ed);
      if (!tlvPath) {
        showToast("No TLV path found at cursor position.", "info");
        return;
      }

      navigator.clipboard.writeText(tlvPath).then(
        () => showToast(`Copied: ${tlvPath}`, "success"),
        () => showToast("Failed to copy path to clipboard.", "error"),
      );
    },
  });

  editor.addAction({
    id: "docsis-get-link-for-tlv",
    label: "Get Link for TLV",
    contextMenuGroupId: "9_cutcopypaste",
    contextMenuOrder: 6,

    run: (ed: monaco.editor.ICodeEditor) => {
      const tlvPath = getTlvPathAtCursor(ed);
      if (!tlvPath) {
        showToast("No TLV path found at cursor position.", "info");
        return;
      }

      const model = ed.getModel();
      if (!model) return;

      const content = model.getValue();
      if (isShareUrlTooLong(content)) {
        showToast(
          "This config is very large \u2014 the link may not work in all browsers.",
          "warning",
        );
      }

      const encoded = encodeConfig(content);
      const url =
        window.location.origin +
        window.location.pathname +
        buildHash({ config: encoded, tlv: tlvPath });

      navigator.clipboard.writeText(url).then(
        () => showToast(`Link copied for ${tlvPath}`, "success"),
        () => showToast("Failed to copy link to clipboard.", "error"),
      );
    },
  });
}
