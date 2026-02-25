/**
 * Codec module — re-exports types and the WASM bridge
 * for DOCSIS binary encode/decode.
 */

export type { Encoder, Decoder } from "./types.js";
export type { ProgressCallback } from "./wasm-codec.js";
export { initWasm, encode, decode, isReady, loadMIBs } from "./wasm-codec.js";
