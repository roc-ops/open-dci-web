/**
 * File open — uses the File System Access API with fallback
 * to let the user open DOCSIS config files from disk.
 *
 * Two entry points:
 *   - openFile()       — for Open button (JSONC text configs)
 *   - openBinaryFile() — for Decode button (binary configs)
 */

import {
  pickFiles,
  hasOpenFilePicker,
  showOpenFilePicker,
} from "./pick-files";

export interface OpenFileResult {
  name: string;
  content: string | Uint8Array;
}

const TEXT_EXTENSIONS = [".jsonc", ".json"];
const BINARY_EXTENSIONS = [".bin", ".cm", ".cfg"];

function isTextFile(name: string): boolean {
  return TEXT_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));
}

interface FileTypeFilter {
  description: string;
  accept: Record<string, string[]>;
}

/**
 * Opens a text config file (JSONC/JSON).
 * Used by the Open button.
 */
export async function openFile(): Promise<OpenFileResult> {
  const types: FileTypeFilter[] = [
    {
      description: "OpenDCI JSONC Config",
      accept: { "application/json": TEXT_EXTENSIONS },
    },
  ];
  const fallbackAccept = TEXT_EXTENSIONS.join(",");
  return pickFile(types, fallbackAccept);
}

/**
 * Opens a binary config file for decoding.
 * Used by the Decode button.
 */
export async function openBinaryFile(): Promise<OpenFileResult> {
  const types: FileTypeFilter[] = [
    {
      description: "DOCSIS Binary Config",
      accept: { "application/octet-stream": BINARY_EXTENSIONS },
    },
  ];
  const fallbackAccept = BINARY_EXTENSIONS.join(",");
  return pickFile(types, fallbackAccept);
}

async function pickFile(
  types: FileTypeFilter[],
  fallbackAccept: string,
): Promise<OpenFileResult> {
  if (hasOpenFilePicker()) {
    return pickWithFilePicker(types);
  }
  return pickWithInput(fallbackAccept);
}

async function pickWithFilePicker(
  types: FileTypeFilter[],
): Promise<OpenFileResult> {
  const [handle] = await showOpenFilePicker({ types, multiple: false });
  const file = await handle.getFile();
  const buffer = await file.arrayBuffer();

  if (isTextFile(file.name)) {
    return { name: file.name, content: new TextDecoder().decode(buffer) };
  }
  return { name: file.name, content: new Uint8Array(buffer) };
}

async function pickWithInput(accept: string): Promise<OpenFileResult> {
  const [file] = await pickFiles({ accept });
  const buffer = await file.arrayBuffer();
  if (isTextFile(file.name)) {
    return { name: file.name, content: new TextDecoder().decode(buffer) };
  }
  return { name: file.name, content: new Uint8Array(buffer) };
}
