/**
 * Firmware file picker — lets the user select a signed cable modem
 * firmware file from disk.  Uses the File System Access API with a
 * hidden <input type="file"> fallback (same dual-path approach as
 * src/file/open.ts).
 *
 * Returns the raw firmware bytes as a Uint8Array along with the
 * original filename.
 */

import {
  pickFiles,
  hasOpenFilePicker,
  showOpenFilePicker,
} from "./pick-files";

/** Result of picking a firmware file. */
export interface FirmwarePickResult {
  /** Raw firmware bytes. */
  data: Uint8Array;
  /** Original filename (e.g. "firmware.bin"). */
  name: string;
}

const FIRMWARE_EXTENSIONS = [".bin", ".img", ".pkd", ".ssd"];
const FIRMWARE_ACCEPT = FIRMWARE_EXTENSIONS.join(",");

/**
 * Open a file picker restricted to firmware-type files and return the
 * selected file's contents as a Uint8Array along with the filename.
 */
export async function pickFirmwareFile(): Promise<FirmwarePickResult> {
  if (hasOpenFilePicker()) {
    return pickWithFilePicker();
  }
  return pickWithInput();
}

async function pickWithFilePicker(): Promise<FirmwarePickResult> {
  const [handle] = await showOpenFilePicker({
    types: [
      {
        description: "Signed Cable Modem Firmware",
        accept: { "application/octet-stream": FIRMWARE_EXTENSIONS },
      },
    ],
    multiple: false,
  });

  const file = await handle.getFile();
  const buffer = await file.arrayBuffer();
  return { data: new Uint8Array(buffer), name: file.name };
}

async function pickWithInput(): Promise<FirmwarePickResult> {
  const [file] = await pickFiles({ accept: FIRMWARE_ACCEPT });
  const buffer = await file.arrayBuffer();
  return { data: new Uint8Array(buffer), name: file.name };
}
