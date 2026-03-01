/**
 * Shared file picker utilities.
 *
 * Provides a common `pickFiles()` helper that wraps the hidden
 * `<input type="file">` pattern used across the app, plus typed
 * accessors for the File System Access API (`showOpenFilePicker` /
 * `showSaveFilePicker`) so call-sites don't need verbose casts.
 */

// ---------------------------------------------------------------------------
// Hidden <input type="file"> helper
// ---------------------------------------------------------------------------

export interface PickFilesOptions {
  /** Comma-separated list of accepted extensions, e.g. ".json,.txt". */
  accept: string;
  /** Allow selecting multiple files. Defaults to false. */
  multiple?: boolean;
}

/**
 * Show a hidden `<input type="file">` dialog and return the chosen
 * `File` objects.  Rejects if the user cancels or selects nothing.
 */
export function pickFiles(options: PickFilesOptions): Promise<File[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = options.accept;
    if (options.multiple) input.multiple = true;
    input.style.display = "none";
    document.body.appendChild(input);

    input.addEventListener("change", () => {
      document.body.removeChild(input);
      const files = input.files;
      if (!files || files.length === 0) {
        reject(new Error("No file selected"));
        return;
      }
      resolve(Array.from(files));
    });

    input.addEventListener("cancel", () => {
      document.body.removeChild(input);
      reject(new Error("File selection cancelled"));
    });

    input.click();
  });
}

// ---------------------------------------------------------------------------
// File System Access API typed wrappers
// ---------------------------------------------------------------------------

/** Options accepted by `showOpenFilePicker`. */
export interface OpenFilePickerOptions {
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
  multiple?: boolean;
}

/** Options accepted by `showSaveFilePicker`. */
export interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}

/**
 * Typed wrapper around `window.showOpenFilePicker`.
 *
 * Returns `undefined` when the API is not available (caller should
 * fall back to `pickFiles()`).
 */
export function showOpenFilePicker(
  options: OpenFilePickerOptions,
): Promise<FileSystemFileHandle[]> {
  return (
    window as unknown as {
      showOpenFilePicker: (
        opts: OpenFilePickerOptions,
      ) => Promise<FileSystemFileHandle[]>;
    }
  ).showOpenFilePicker(options);
}

/** Whether the File System Access `showOpenFilePicker` API is available. */
export function hasOpenFilePicker(): boolean {
  return "showOpenFilePicker" in window;
}

/**
 * Typed wrapper around `window.showSaveFilePicker`.
 */
export function showSaveFilePicker(
  options: SaveFilePickerOptions,
): Promise<FileSystemFileHandle> {
  return (
    window as unknown as {
      showSaveFilePicker: (
        opts: SaveFilePickerOptions,
      ) => Promise<FileSystemFileHandle>;
    }
  ).showSaveFilePicker(options);
}

/** Whether the File System Access `showSaveFilePicker` API is available. */
export function hasSaveFilePicker(): boolean {
  return "showSaveFilePicker" in window;
}
