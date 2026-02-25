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

/**
 * Initialize the WASM runtime. Must be called before encode/decode.
 * Loads wasm_exec.js, the compiled WASM binary, then starts the Go runtime,
 * loads the TLV schema, and initializes the core MIB resolver.
 */
export async function initWasm(): Promise<void> {
  if (wasmReady) return;

  // Load Go's wasm_exec.js glue script.
  await loadScript("/wasm_exec.js");

  // Instantiate the Go WASM module.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const go = new (globalThis as any).Go();

  const result = await WebAssembly.instantiateStreaming(
    fetch("/opendci.wasm"),
    go.importObject,
  );

  // Start the Go runtime (runs main(), registers JS functions, blocks forever).
  go.run(result.instance);

  // Load the TLV schema from the static asset.
  const schemaResp = await fetch("/docsis-config.jtd.json");
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
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mibResult: { ok?: boolean; error?: string } = (globalThis as any).opendciInitMIBs();
    if (mibResult.error) {
      console.warn("MIB resolver init failed (non-fatal):", mibResult.error);
    }
  } catch (e) {
    console.warn("MIB resolver init failed (non-fatal):", e);
  }

  wasmReady = true;
}

/**
 * Decode a binary DOCSIS config file into a JSONC string.
 * Throws on error.
 */
export function decode(binary: Uint8Array): string {
  if (!wasmReady) throw new Error("WASM not initialized — call initWasm() first");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: { result?: string; error?: string } = (globalThis as any).opendciDecode(binary);
  if (result.error) {
    throw new Error(result.error);
  }
  return result.result as string;
}

/**
 * Encode a JSON/JSONC string into a binary DOCSIS config file.
 * Throws on error.
 */
export function encode(json: string): Uint8Array {
  if (!wasmReady) throw new Error("WASM not initialized — call initWasm() first");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: { result?: Uint8Array; error?: string } = (globalThis as any).opendciEncode(json);
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
