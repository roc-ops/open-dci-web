/**
 * File open — uses the File System Access API with fallback
 * to let the user open DOCSIS config files from disk.
 */

export interface OpenFileResult {
  name: string;
  content: string | Uint8Array;
}

const TEXT_EXTENSIONS = [".jsonc", ".json"];
const BINARY_EXTENSIONS = [".bin", ".cm"];

function isTextFile(name: string): boolean {
  return TEXT_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));
}

/**
 * Opens a file using the File System Access API if available,
 * falling back to a hidden <input type="file"> element.
 */
export async function openFile(): Promise<OpenFileResult> {
  if ("showOpenFilePicker" in window) {
    return openWithFilePicker();
  }
  return openWithInput();
}

async function openWithFilePicker(): Promise<OpenFileResult> {
  const [handle] = await (window as unknown as { showOpenFilePicker: (opts: unknown) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker({
    types: [
      {
        description: "OpenDCI JSONC Config",
        accept: { "application/json": [".jsonc", ".json"] },
      },
      {
        description: "DOCSIS Binary Config",
        accept: { "application/octet-stream": [".bin", ".cm"] },
      },
    ],
    multiple: false,
  });
  const file = await handle.getFile();
  const buffer = await file.arrayBuffer();

  if (isTextFile(file.name)) {
    return { name: file.name, content: new TextDecoder().decode(buffer) };
  }
  return { name: file.name, content: new Uint8Array(buffer) };
}

function openWithInput(): Promise<OpenFileResult> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = [...TEXT_EXTENSIONS, ...BINARY_EXTENSIONS].join(",");
    input.style.display = "none";
    document.body.appendChild(input);

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      document.body.removeChild(input);
      if (!file) {
        reject(new Error("No file selected"));
        return;
      }
      const buffer = await file.arrayBuffer();
      if (isTextFile(file.name)) {
        resolve({ name: file.name, content: new TextDecoder().decode(buffer) });
      } else {
        resolve({ name: file.name, content: new Uint8Array(buffer) });
      }
    });

    input.addEventListener("cancel", () => {
      document.body.removeChild(input);
      reject(new Error("File selection cancelled"));
    });

    input.click();
  });
}
