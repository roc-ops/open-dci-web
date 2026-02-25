/**
 * WASM-based encoder/decoder using the OpenDCI Go reference implementation.
 *
 * The Go WASM module exposes five global functions:
 *   - opendciLoadSchema(string) -> {ok: true} | {error: string}
 *   - opendciDecode(Uint8Array) -> {result: string} | {error: string}
 *   - opendciEncode(string) -> {result: Uint8Array} | {error: string}
 *   - opendciInitMIBs() -> {ok: true} | {error: string}
 *   - opendciLoadMIBs({[filename]: string}) -> {ok: true, loaded: number} | {error: string}
 */

let wasmReady = false;

export type ProgressCallback = (message: string) => void;

/**
 * Initialize the WASM runtime. Must be called before encode/decode.
 * Loads wasm_exec.js, the compiled WASM binary, then starts the Go runtime,
 * loads the TLV schema, and initializes the core MIB resolver.
 *
 * @param onProgress - optional callback invoked with status messages during init
 */
export async function initWasm(onProgress?: ProgressCallback): Promise<Record<string, string>> {
  if (wasmReady) return {};

  const base = import.meta.env.BASE_URL;
  const report = onProgress ?? (() => {});

  report("Loading WASM runtime\u2026");
  // Load Go's wasm_exec.js glue script.
  await loadScript(`${base}wasm_exec.js`);

  // Instantiate the Go WASM module.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const go = new (globalThis as any).Go();

  const result = await WebAssembly.instantiateStreaming(
    fetch(`${base}opendci.wasm`),
    go.importObject,
  );

  // Start the Go runtime (runs main(), registers JS functions, blocks forever).
  go.run(result.instance);

  report("Loading DOCSIS schema\u2026");
  // Load the TLV schema from the static asset.
  const schemaResp = await fetch(`${base}docsis-config.jtd.json`);
  if (!schemaResp.ok) {
    throw new Error(`Failed to fetch schema: ${schemaResp.status}`);
  }
  const schemaJSON = await schemaResp.text();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loadResult: { ok?: boolean; error?: string } = (globalThis as any).opendciLoadSchema(schemaJSON);
  if (loadResult.error) {
    throw new Error(`Failed to load schema: ${loadResult.error}`);
  }

  // Initialize the core MIB resolver (embedded MIBs only).
  // Non-fatal: encode/decode still work without MIB annotations.
  report("Initializing MIB resolver\u2026");
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mibResult: { ok?: boolean; error?: string } = (globalThis as any).opendciInitMIBs();
    if (mibResult.error) {
      console.warn("MIB resolver init failed (non-fatal):", mibResult.error);
    }
  } catch (e) {
    console.warn("MIB resolver init failed (non-fatal):", e);
  }

  // Load the full MIB library for OID/enum resolution.
  let mibBundle: Record<string, string> = {};
  try {
    report("Downloading MIB library\u2026");
    const mibResp = await fetch(`${base}mibs.json`);
    if (mibResp.ok) {
      mibBundle = await mibResp.json();
      const mibCount = Object.keys(mibBundle).length;
      if (mibCount > 0) {
        report(`Parsing ${mibCount} MIB files\u2026`);
        // Yield to let the browser paint the progress message before the
        // synchronous opendciLoadMIBs call blocks the main thread.
        await new Promise((r) => setTimeout(r, 0));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const loadResult: { ok?: boolean; loaded?: number; error?: string } = (globalThis as any).opendciLoadMIBs(mibBundle);
        if (loadResult.error) {
          console.warn("MIB loading failed (non-fatal):", loadResult.error);
        }
      }
    }
  } catch (e) {
    console.warn("MIB loading failed (non-fatal):", e);
  }

  wasmReady = true;
  return mibBundle;
}

/**
 * Decode a binary DOCSIS config file into a JSONC string.
 * Throws on error.
 */
export function decode(binary: Uint8Array, secret?: string): string {
  if (!wasmReady) throw new Error("WASM not initialized — call initWasm() first");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: { result?: string; error?: string } = secret
    ? (globalThis as any).opendciDecode(binary, secret)
    : (globalThis as any).opendciDecode(binary);
  if (result.error) {
    throw new Error(result.error);
  }
  return result.result as string;
}

/**
 * Encode a JSON/JSONC string into a binary DOCSIS config file.
 * Throws on error.
 */
export function encode(json: string, secret?: string): Uint8Array {
  if (!wasmReady) throw new Error("WASM not initialized — call initWasm() first");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: { result?: Uint8Array; error?: string } = secret
    ? (globalThis as any).opendciEncode(json, secret)
    : (globalThis as any).opendciEncode(json);
  if (result.error) {
    throw new Error(result.error);
  }
  return result.result as Uint8Array;
}

/**
 * Load additional MIB files into the resolver for OID resolution.
 * mibFiles maps filename (e.g. "IF-MIB.mib") to file content string.
 * Returns the number of MIB modules successfully loaded.
 */
export function loadMIBs(mibFiles: Record<string, string>): number {
  if (!wasmReady) throw new Error("WASM not initialized — call initWasm() first");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: { ok?: boolean; loaded?: number; error?: string } = (globalThis as any).opendciLoadMIBs(mibFiles);
  if (result.error) {
    throw new Error(result.error);
  }
  return result.loaded ?? 0;
}

/**
 * Reset the MIB resolver, clearing all loaded MIBs.
 * After calling this, you can reload MIBs with loadMIBs().
 */
export function resetMIBs(): void {
  if (!wasmReady) throw new Error("WASM not initialized — call initWasm() first");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: { ok?: boolean; error?: string } = (globalThis as any).opendciInitMIBs();
  if (result.error) {
    throw new Error(`Failed to reset MIBs: ${result.error}`);
  }
}

/**
 * Returns true if the WASM runtime has been initialized.
 */
export function isReady(): boolean {
  return wasmReady;
}

/**
 * Dynamically loads a script tag into the document head.
 */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already loaded.
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}
