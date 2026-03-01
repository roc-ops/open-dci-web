/**
 * WASM-based encoder/decoder using the OpenDCI Go reference implementation.
 *
 * The Go WASM module exposes thirteen global functions:
 *   - opendciLoadSchema(string) -> {ok: true} | {error: string}
 *   - opendciLoadMtaSchema(string) -> {ok: true} | {error: string}
 *   - opendciDecode(Uint8Array, secret?) -> {result: string} | {error: string}
 *   - opendciEncode(string, secret?, pad?, packetCableHash?, format?) -> {result: Uint8Array} | {error: string}
 *   - opendciInitMIBs() -> {ok: true} | {error: string}
 *   - opendciLoadMIBs({[filename]: string}) -> {ok: true, loaded: number} | {error: string}
 *   - opendciQueryMIBTree() -> {result: string} | {error: string}
 *   - opendciResolveName(numericOid) -> {result: string} | {error: string}
 *   - opendciResolveOID(name) -> {result: string} | {error: string}
 *   - opendciExtractCVC(Uint8Array) -> {result: ExtractCVCResult} | {error: string}
 *   - opendciLoadVendorSchema(string) -> {ok: true} | {error: string}
 *   - opendciSerializeMIBState() -> {result: Uint8Array} | {error: string}
 *   - opendciRestoreMIBState(Uint8Array) -> {ok: true} | {error: string}
 */

/** Result types for Go WASM API calls. */
interface WasmOkResult { ok?: boolean; error?: string }
interface WasmLoadMIBsResult { ok?: boolean; loaded?: number; error?: string }
interface WasmStringResult { result?: string; error?: string }
interface WasmBinaryResult { result?: Uint8Array; error?: string }
interface WasmExtractCVCResult { result?: ExtractCVCResult; error?: string }

/** Go WASM runtime constructor injected by wasm_exec.js. */
interface GoInstance {
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): void;
}

declare global {
  // eslint-disable-next-line no-var
  var Go: { new(): GoInstance };
  function opendciLoadSchema(schema: string): WasmOkResult;
  function opendciLoadMtaSchema(schema: string): WasmOkResult;
  function opendciDecode(binary: Uint8Array, secret?: string): WasmStringResult;
  function opendciEncode(json: string, secret?: string, pad?: boolean, packetCableHash?: string, format?: string): WasmBinaryResult;
  function opendciInitMIBs(): WasmOkResult;
  function opendciLoadMIBs(mibFiles: Record<string, string>): WasmLoadMIBsResult;
  function opendciQueryMIBTree(): WasmStringResult;
  function opendciResolveName(numericOid: string): WasmStringResult;
  function opendciResolveOID(name: string): WasmStringResult;
  function opendciExtractCVC(firmware: Uint8Array): WasmExtractCVCResult;
  function opendciLoadVendorSchema(schema: string): WasmOkResult;
  function opendciSerializeMIBState(): WasmBinaryResult;
  function opendciRestoreMIBState(snapshot: Uint8Array): WasmOkResult;
}

let wasmReady = false;

export type ProgressCallback = (message: string) => void;

/** Result of WASM initialization — bundles loaded during startup. */
export interface InitResult {
  mibBundle: Record<string, string>;
  vendorSchemaBundle: Record<string, unknown>;
}

/**
 * Initialize the WASM runtime. Must be called before encode/decode.
 * Loads wasm_exec.js, the compiled WASM binary, then starts the Go runtime,
 * loads the TLV schema, and initializes the core MIB resolver.
 *
 * @param onProgress - optional callback invoked with status messages during init
 */
export async function initWasm(onProgress?: ProgressCallback): Promise<InitResult> {
  if (wasmReady) return { mibBundle: {}, vendorSchemaBundle: {} };

  const base = import.meta.env.BASE_URL;
  const report = onProgress ?? (() => {});

  report("Loading WASM runtime\u2026");
  // Load Go's wasm_exec.js glue script.
  await loadScript(`${base}wasm_exec.js`);

  // Instantiate the Go WASM module.
  const go = new globalThis.Go();

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

  const loadResult = globalThis.opendciLoadSchema(schemaJSON);
  if (loadResult.error) {
    throw new Error(`Failed to load schema: ${loadResult.error}`);
  }

  // Load the MTA (PacketCable) schema for embedded MTA config support.
  // Non-fatal: CM encode/decode still works without MTA schema.
  report("Loading MTA schema\u2026");
  try {
    const mtaResp = await fetch(`${base}mta-config.jtd.json`);
    if (mtaResp.ok) {
      const mtaJSON = await mtaResp.text();
      const mtaResult = globalThis.opendciLoadMtaSchema(mtaJSON);
      if (mtaResult.error) {
        console.warn("MTA schema load failed (non-fatal):", mtaResult.error);
      }
    }
  } catch (e) {
    console.warn("MTA schema load failed (non-fatal):", e);
  }

  // Initialize the core MIB resolver (embedded MIBs only).
  // Non-fatal: encode/decode still work without MIB annotations.
  report("Initializing MIB resolver\u2026");
  try {
    const mibResult = globalThis.opendciInitMIBs();
    if (mibResult.error) {
      console.warn("MIB resolver init failed (non-fatal):", mibResult.error);
    }
  } catch (e) {
    console.warn("MIB resolver init failed (non-fatal):", e);
  }

  // Load the full MIB library for OID/enum resolution.
  // Fast path: try restoring from a pre-parsed snapshot.
  // Fallback: parse mibs.json the slow way.
  // Both paths need mibs.json for the UI (MIB manager state), so fetch it in parallel.
  let mibBundle: Record<string, string> = {};
  try {
    report("Downloading MIB library\u2026");
    const [snapshotResp, mibResp] = await Promise.all([
      fetch(`${base}mibs.snapshot`).catch(() => null),
      fetch(`${base}mibs.json`),
    ]);

    if (mibResp.ok) {
      mibBundle = await mibResp.json();
    }

    let restored = false;
    if (snapshotResp?.ok) {
      try {
        report("Restoring MIB library\u2026");
        const snapshotBuf = new Uint8Array(await snapshotResp.arrayBuffer());
        const restoreResult = globalThis.opendciRestoreMIBState(snapshotBuf);
        if (restoreResult.ok) {
          restored = true;
        } else {
          console.warn("MIB snapshot restore failed, falling back to parse:", restoreResult.error);
        }
      } catch (e) {
        console.warn("MIB snapshot restore failed, falling back to parse:", e);
      }
    }

    if (!restored) {
      const mibCount = Object.keys(mibBundle).length;
      if (mibCount > 0) {
        report(`Parsing ${mibCount} MIB files\u2026`);
        await new Promise((r) => setTimeout(r, 0));
        const loadResult = globalThis.opendciLoadMIBs(mibBundle);
        if (loadResult.error) {
          console.warn("MIB loading failed (non-fatal):", loadResult.error);
        }
      }
    }
  } catch (e) {
    console.warn("MIB loading failed (non-fatal):", e);
  }

  // Load vendor-specific schemas (optional, non-fatal).
  let vendorSchemaBundle: Record<string, unknown> = {};
  try {
    report("Loading vendor schemas\u2026");
    const vendorResp = await fetch(`${base}vendor-schemas.json`);
    if (vendorResp.ok) {
      vendorSchemaBundle = await vendorResp.json();
      const vendorCount = Object.keys(vendorSchemaBundle).length;
      if (vendorCount > 0) {
        for (const [filename, schema] of Object.entries(vendorSchemaBundle)) {
          try {
            const loadResult = globalThis.opendciLoadVendorSchema(JSON.stringify(schema));
            if (loadResult.error) {
              console.warn(`Vendor schema ${filename} failed (non-fatal):`, loadResult.error);
            }
          } catch (e) {
            console.warn(`Vendor schema ${filename} failed (non-fatal):`, e);
          }
        }
        report(`Loaded ${vendorCount} vendor schema(s)`);
      }
    }
  } catch (e) {
    console.warn("Vendor schema loading failed (non-fatal):", e);
  }

  wasmReady = true;
  return { mibBundle, vendorSchemaBundle };
}

/**
 * Decode a binary DOCSIS config file into a JSONC string.
 * Throws on error.
 */
export function decode(binary: Uint8Array, secret?: string): string {
  if (!wasmReady) throw new Error("WASM not initialized — call initWasm() first");
  const result = secret
    ? globalThis.opendciDecode(binary, secret)
    : globalThis.opendciDecode(binary);
  if (result.error) {
    throw new Error(result.error);
  }
  return result.result as string;
}

/** PacketCable hash variant for MTA config files. */
export type PacketCableVariant = "na" | "eu" | "ietf";

/**
 * Encode a JSON/JSONC string into a binary DOCSIS config file.
 * Optionally computes CMTS MIC (if secret provided) and/or
 * PacketCable hash (if variant provided, for MTA configs only).
 * The format parameter ("cm" or "mta") tells the encoder which
 * schema/registry to use; if omitted the encoder auto-detects.
 * Throws on error.
 */
export function encode(json: string, secret?: string, packetCableHash?: PacketCableVariant, format?: string): Uint8Array {
  if (!wasmReady) throw new Error("WASM not initialized — call initWasm() first");
  // Call with only defined arguments to avoid Go seeing "undefined" strings.
  let result: WasmBinaryResult;
  if (format) {
    result = globalThis.opendciEncode(json, secret ?? "", false, packetCableHash ?? "", format);
  } else if (packetCableHash) {
    result = globalThis.opendciEncode(json, secret ?? "", false, packetCableHash);
  } else if (secret) {
    result = globalThis.opendciEncode(json, secret);
  } else {
    result = globalThis.opendciEncode(json);
  }
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
  const result = globalThis.opendciLoadMIBs(mibFiles);
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
  const result = globalThis.opendciInitMIBs();
  if (result.error) {
    throw new Error(`Failed to reset MIBs: ${result.error}`);
  }
}

/** Named integer value from a MIB object's SYNTAX enum clause. */
export interface EnumValue {
  value: number;
  label: string;
}

/** Index column from a SNMP table's INDEX clause. */
export interface IndexObject {
  name: string;
  oid: string;
  module: string;
  syntax?: string;
  description?: string;
}

/** Node in the MIB OID tree returned by queryMIBTree(). */
export interface MIBTreeNode {
  oid: string;
  name: string;
  module: string;
  description: string;
  syntax: string;
  access: string;
  nodeType: string;
  indexes?: IndexObject[];
  enums?: EnumValue[];
  children?: MIBTreeNode[];
}

/**
 * Query the full MIB OID tree from the WASM resolver.
 * Returns the tree rooted at OID "1" (iso) with recursive children.
 * Requires MIBs to be loaded via initWasm() first.
 */
export function queryMIBTree(): MIBTreeNode {
  if (!wasmReady) throw new Error("WASM not initialized — call initWasm() first");
  const result = globalThis.opendciQueryMIBTree();
  if (result.error) {
    throw new Error(result.error);
  }
  return JSON.parse(result.result as string);
}

/**
 * Resolve a numeric OID to its full named path.
 * e.g. "1.3.6.1.2.1.1.1" → "iso.org.dod.internet.mgmt.mib-2.system.sysDescr"
 */
export function resolveName(numericOid: string): string {
  if (!wasmReady) throw new Error("WASM not initialized — call initWasm() first");
  const result = globalThis.opendciResolveName(numericOid);
  if (result.error) {
    throw new Error(result.error);
  }
  return result.result as string;
}

/**
 * Resolve a named OID to its numeric dotted-decimal form.
 * Accepts MODULE::objectName, plain name, or dotted named path.
 * e.g. "IF-MIB::ifAdminStatus" → "1.3.6.1.2.1.2.2.1.7"
 */
export function resolveOID(name: string): string {
  if (!wasmReady) throw new Error("WASM not initialized — call initWasm() first");
  const result = globalThis.opendciResolveOID(name);
  if (result.error) {
    throw new Error(result.error);
  }
  return result.result as string;
}

/** Result of extracting CVC certificates from a signed firmware file. */
export interface ExtractCVCResult {
  ManufacturerCvc: string | null;
  CoSignerCvc: string | null;
  ManufacturerCvcChain: string | null;
  CoSignerCvcChain: string | null;
}

/**
 * Extract CVC certificates from a signed cable modem firmware binary.
 * Returns an object with certificate hex strings keyed by type.
 * Fields not found in the firmware are null.
 * Throws on error.
 */
export function extractCVC(firmware: Uint8Array): ExtractCVCResult {
  if (!wasmReady) throw new Error("WASM not initialized — call initWasm() first");
  const result = globalThis.opendciExtractCVC(firmware);
  if (result.error) {
    throw new Error(result.error);
  }
  return result.result as ExtractCVCResult;
}

/**
 * Load the PacketCable MTA JTD schema into the WASM registry.
 * Enables auto-detection of MTA format in decode/encode and
 * recursive decoding of embedded MTA configs inside CM files (TLV 216).
 * Must be called after initWasm(). Throws on error.
 */
export function loadMtaSchema(schemaJSON: string): void {
  if (!wasmReady) throw new Error("WASM not initialized — call initWasm() first");
  const result = globalThis.opendciLoadMtaSchema(schemaJSON);
  if (result.error) {
    throw new Error(result.error);
  }
}

/**
 * Load a vendor-specific JTD schema into the WASM registry.
 * Must be called after initWasm(). Can be called multiple times
 * for different vendors.
 * Throws on error.
 */
export function loadVendorSchema(schemaJSON: string): void {
  if (!wasmReady) throw new Error("WASM not initialized — call initWasm() first");
  const result = globalThis.opendciLoadVendorSchema(schemaJSON);
  if (result.error) {
    throw new Error(result.error);
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
