/**
 * Codec module — re-exports types and will provide the WASM bridge
 * for DOCSIS binary encode/decode.
 */

export type { Encoder, Decoder } from "./types.js";

// TODO: Import and re-export WASM-based encoder/decoder implementations
// once the WASM bridge is built.
