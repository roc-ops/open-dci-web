/**
 * Codec module — re-exports types and the WASM bridge
 * for DOCSIS binary encode/decode.
 */

export type { ProgressCallback, InitResult, MIBTreeNode, IndexObject, EnumValue, PacketCableVariant, ExtractCVCResult } from "./wasm-codec.js";
export { initWasm, encode, decode, isReady, loadMIBs, resetMIBs, queryMIBTree, resolveName, resolveOID, extractCVC, loadMtaSchema, loadVendorSchema } from "./wasm-codec.js";
