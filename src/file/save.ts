/**
 * File save — uses the File System Access API with fallback
 * to save config files to disk.
 */

/**
 * Saves content to a file. Uses showSaveFilePicker if available,
 * otherwise creates a download link.
 */
export async function saveFile(
  content: string,
  filename: string,
): Promise<void> {
  if ("showSaveFilePicker" in window) {
    return saveWithFilePicker(content, filename);
  }
  return saveWithDownload(content, filename);
}

async function saveWithFilePicker(
  content: string,
  filename: string,
): Promise<void> {
  const handle = await (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
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
