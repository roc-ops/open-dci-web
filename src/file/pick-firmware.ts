/**
 * Firmware file picker — lets the user select a signed cable modem
 * firmware file from disk.  Uses the File System Access API with a
 * hidden <input type="file"> fallback (same dual-path approach as
 * src/file/open.ts).
 *
 * Returns the raw firmware bytes as a Uint8Array.
 */

/**
 * Open a file picker restricted to firmware-type files and return the
 * selected file's contents as a Uint8Array.
 */
export async function pickFirmwareFile(): Promise<Uint8Array> {
  if ("showOpenFilePicker" in window) {
    return pickWithFilePicker();
  }
  return pickWithInput();
}

async function pickWithFilePicker(): Promise<Uint8Array> {
  const [handle] = await (
    window as unknown as {
      showOpenFilePicker: (
        opts: unknown,
      ) => Promise<FileSystemFileHandle[]>;
    }
  ).showOpenFilePicker({
    types: [
      {
        description: "Signed Cable Modem Firmware",
        accept: { "application/octet-stream": [".bin", ".img", ".pkd", ".ssd"] },
      },
    ],
    multiple: false,
  });

  const file = await handle.getFile();
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

function pickWithInput(): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".bin,.img,.pkd,.ssd";
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
      resolve(new Uint8Array(buffer));
    });

    input.addEventListener("cancel", () => {
      document.body.removeChild(input);
      reject(new Error("File selection cancelled"));
    });

    input.click();
  });
}
