/**
 * Sharing module — public API for URL-based config sharing.
 */
export {
  parseHashParams,
  buildHash,
  updateHash,
  getHashParam,
} from "./hash-params";
export type { HashParams } from "./hash-params";

export {
  encodeConfig,
  decodeConfig,
  estimateShareUrlLength,
  isShareUrlTooLong,
  SHARE_URL_MAX_LENGTH,
} from "./config-encoder";
