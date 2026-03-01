/**
 * Drag-and-drop handler — accepts file drops on the editor container.
 *
 * Text files (.jsonc, .json) are opened directly.
 * Binary files (.bin, .cm, .cfg) are decoded via the WASM codec.
 */

const BINARY_EXTENSIONS = /\.(bin|cm|cfg)$/i;
const TEXT_EXTENSIONS = /\.(jsonc?|txt)$/i;

export interface DropHandlerOptions {
  container: HTMLElement;
  onTextFile: (name: string, content: string) => void;
  onBinaryFile: (name: string, content: Uint8Array) => void;
  onError: (message: string) => void;
}

export function registerDropHandler(opts: DropHandlerOptions): void {
  const { container, onTextFile, onBinaryFile, onError } = opts;

  container.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    container.classList.add("drop-active");
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  });

  container.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    container.classList.remove("drop-active");
  });

  container.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    container.classList.remove("drop-active");

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    // Use first file only
    const file = files[0];
    const name = file.name;

    if (BINARY_EXTENSIONS.test(name)) {
      file.arrayBuffer().then(
        (buf) => onBinaryFile(name, new Uint8Array(buf)),
        () => onError("Failed to read the dropped file."),
      );
    } else if (TEXT_EXTENSIONS.test(name) || !name.includes(".")) {
      file.text().then(
        (text) => onTextFile(name, text),
        () => onError("Failed to read the dropped file."),
      );
    } else {
      // Unknown extension — try as text first, fall back to binary
      file.text().then(
        (text) => {
          // Quick heuristic: if it starts with { or [, treat as text config
          const trimmed = text.trimStart();
          if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            onTextFile(name, text);
          } else {
            // Re-read as binary
            file.arrayBuffer().then(
              (buf) => onBinaryFile(name, new Uint8Array(buf)),
              () => onError("Failed to read the dropped file."),
            );
          }
        },
        () => onError("Failed to read the dropped file."),
      );
    }
  });
}
