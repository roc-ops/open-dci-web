/**
 * Generate a pre-parsed MIB snapshot file.
 *
 * Loads the Go WASM runtime, feeds it mibs.json, then calls
 * opendciSerializeMIBState() to produce a binary blob that can
 * be restored on page load without re-parsing SMIv2 files.
 *
 * Usage: node scripts/generate-mib-snapshot.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.join(projectRoot, "public");

// Go's wasm_exec.js expects a browser-like environment.
// Provide minimal polyfills for Node.
if (!globalThis.performance) {
  const { performance } = await import("perf_hooks");
  globalThis.performance = performance;
}
if (!globalThis.crypto) {
  const { webcrypto } = await import("crypto");
  globalThis.crypto = webcrypto;
}

// Load Go's WASM glue.
const wasmExecPath = path.join(publicDir, "wasm_exec.js");
await import(wasmExecPath);

// Instantiate the Go WASM module.
const go = new globalThis.Go();
const wasmPath = path.join(publicDir, "opendci.wasm");
const wasmBuf = fs.readFileSync(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBuf, go.importObject);

// Start the Go runtime (registers JS functions, blocks forever).
go.run(instance);

// Load the TLV schema (required before MIBs).
const schemaPath = path.join(publicDir, "docsis-config.jtd.json");
const schemaJSON = fs.readFileSync(schemaPath, "utf8");
const schemaResult = globalThis.opendciLoadSchema(schemaJSON);
if (schemaResult.error) {
  console.error("Failed to load schema:", schemaResult.error);
  process.exit(1);
}

// Initialize the core MIB resolver.
const initResult = globalThis.opendciInitMIBs();
if (initResult.error) {
  console.error("Failed to init MIBs:", initResult.error);
  process.exit(1);
}

// Load the full MIB library.
const mibsPath = path.join(publicDir, "mibs.json");
const mibBundle = JSON.parse(fs.readFileSync(mibsPath, "utf8"));
const mibCount = Object.keys(mibBundle).length;
console.log(`Loading ${mibCount} MIB files...`);

const loadResult = globalThis.opendciLoadMIBs(mibBundle);
if (loadResult.error) {
  console.error("Failed to load MIBs:", loadResult.error);
  process.exit(1);
}
console.log(`Loaded ${loadResult.loaded} MIB modules.`);

// Serialize the parsed MIB state.
const serializeResult = globalThis.opendciSerializeMIBState();
if (serializeResult.error) {
  console.error("Failed to serialize MIB state:", serializeResult.error);
  process.exit(1);
}

const snapshot = serializeResult.result;
const snapshotPath = path.join(publicDir, "mibs.snapshot");
fs.writeFileSync(snapshotPath, Buffer.from(snapshot));

const sizeKB = Math.round(snapshot.byteLength / 1024);
console.log(`Wrote ${snapshotPath} (${sizeKB} KB)`);

// Done — the Go runtime blocks forever, so force exit.
process.exit(0);
