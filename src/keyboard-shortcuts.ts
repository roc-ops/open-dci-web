/**
 * Keyboard shortcuts — binds standard editor shortcuts to toolbar actions.
 *
 * Shortcuts:
 *   Ctrl/Cmd+O         — Open file
 *   Ctrl/Cmd+S         — Save file (JSONC)
 *   Ctrl/Cmd+Shift+S   — Encode & save binary
 *   Ctrl/Cmd+Shift+L   — Get shareable link
 */
import * as monaco from "monaco-editor";

export interface ShortcutActions {
  onOpen: () => void;
  onSave: () => void;
  onEncode: () => void;
  onShare: () => void;
}

export function registerKeyboardShortcuts(
  editor: monaco.editor.IStandaloneCodeEditor,
  actions: ShortcutActions,
): void {
  editor.addAction({
    id: "docsis-open-file",
    label: "Open File",
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyO],
    run: () => actions.onOpen(),
  });

  editor.addAction({
    id: "docsis-save-file",
    label: "Save File",
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
    run: () => actions.onSave(),
  });

  editor.addAction({
    id: "docsis-encode-save",
    label: "Encode & Save Binary",
    keybindings: [
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyS,
    ],
    run: () => actions.onEncode(),
  });

  editor.addAction({
    id: "docsis-get-link",
    label: "Get Shareable Link",
    keybindings: [
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyL,
    ],
    run: () => actions.onShare(),
  });
}
