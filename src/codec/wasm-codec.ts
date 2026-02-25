/**
 * WASM-based encoder/decoder using the OpenDCI Go reference implementation.
 *
 * The Go WASM module exposes two global functions:
 *   - opendciDecode(Uint8Array) -> {ok: boolean, data?: string, error?: string}
 *   - opendciEncode(string) -> {ok: boolean, data?: Uint8Array, error?: string}
 */

let wasmReady = false;

/** Result type returned by the Go WASM functions. */
interface WasmResult {
  ok: boolean;
  data?: string | Uint8Array;
  error?: string;
}

/**
 * Initialize the WASM runtime. Must be called before encode/decode.
 * Loads wasm_exec.js and the compiled WASM binary, then starts the Go runtime.
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
  wasmReady = true;
}

/**
 * Decode a binary DOCSIS config file into a JSONC string.
 * Throws on error.
 */
export function decode(binary: Uint8Array): string {
  if (!wasmReady) throw new Error("WASM not initialized — call initWasm() first");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: WasmResult = (globalThis as any).opendciDecode(binary);
  if (!result.ok) {
    throw new Error(result.error ?? "Unknown decode error");
  }
  return result.data as string;
}

/**
 * Encode a JSON/JSONC string into a binary DOCSIS config file.
 * Throws on error.
 */
export function encode(json: string): Uint8Array {
  if (!wasmReady) throw new Error("WASM not initialized — call initWasm() first");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: WasmResult = (globalThis as any).opendciEncode(json);
  if (!result.ok) {
    throw new Error(result.error ?? "Unknown encode error");
  }
  return result.data as Uint8Array;
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
