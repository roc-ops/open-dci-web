/**
 * File save — uses the File System Access API with fallback
 * to save config files to disk.
 */

import { hasSaveFilePicker, showSaveFilePicker } from "./pick-files";

/**
 * Saves text content to a file. Uses showSaveFilePicker if available,
 * otherwise creates a download link.
 */
export async function saveFile(
  content: string,
  filename: string,
): Promise<void> {
  if (hasSaveFilePicker()) {
    return saveWithFilePicker(content, filename);
  }
  return saveWithDownload(content, filename);
}

/**
 * Saves binary content to a file. Uses showSaveFilePicker if available,
 * otherwise creates a download link.
 */
export async function saveBinaryFile(
  data: Uint8Array,
  filename: string,
): Promise<void> {
  if (hasSaveFilePicker()) {
    return saveBinaryWithFilePicker(data, filename);
  }
  return saveBinaryWithDownload(data, filename);
}

async function saveWithFilePicker(
  content: string,
  filename: string,
): Promise<void> {
  const handle = await showSaveFilePicker({
    suggestedName: filename,
    types: [
      {
        description: "OpenDCI JSONC Config",
        accept: { "application/json": [".jsonc", ".json"] },
      },
    ],
  });
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function saveBinaryWithFilePicker(
  data: Uint8Array,
  filename: string,
): Promise<void> {
  const handle = await showSaveFilePicker({
    suggestedName: filename,
    types: [
      {
        description: "DOCSIS Binary Config",
        accept: { "application/octet-stream": [".bin", ".cm", ".cfg"] },
      },
    ],
  });
  const writable = await handle.createWritable();
  await writable.write(data as unknown as FileSystemWriteChunkType);
  await writable.close();
}

function saveWithDownload(content: string, filename: string): Promise<void> {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return Promise.resolve();
}

function saveBinaryWithDownload(data: Uint8Array, filename: string): Promise<void> {
  const blob = new Blob([data as BlobPart], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return Promise.resolve();
}
