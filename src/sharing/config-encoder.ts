/**
 * Config encoder/decoder — compresses editor content for URL sharing.
 *
 * Pipeline:
 *   encode: string  ->  pako.deflate (Uint8Array)  ->  base64url string
 *   decode: base64url string  ->  Uint8Array  ->  pako.inflate  ->  string
 *
 * Uses URL-safe base64 to avoid issues with `+`, `/`, and `=` characters
 * that would need percent-encoding inside URL hash fragments.
 */
import { deflate, inflate } from "pako";

// ---------------------------------------------------------------------------
// Base64url helpers
// ---------------------------------------------------------------------------

/**
 * Encode a Uint8Array to a URL-safe base64 string.
 *
 * Standard base64 characters that are problematic in URLs:
 *   +  ->  -
 *   /  ->  _
 * Trailing `=` padding is stripped (the decoder re-adds it).
 */
function toBase64url(bytes: Uint8Array): string {
  // Convert bytes to a binary string, then use btoa
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Decode a URL-safe base64 string back to a Uint8Array.
 * Re-adds padding that was stripped during encoding.
 */
function fromBase64url(encoded: string): Uint8Array {
  // Restore standard base64 alphabet and padding
  let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  if (pad === 2) base64 += "==";
  else if (pad === 3) base64 += "=";

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compress and encode editor content for embedding in a URL hash.
 *
 * @param content  The raw editor text (JSON/JSONC string).
 * @returns        A URL-safe base64 string of the deflated content.
 */
export function encodeConfig(content: string): string {
  const bytes = new TextEncoder().encode(content);
  const compressed = deflate(bytes);
  return toBase64url(compressed);
}

/**
 * Decode and decompress a URL hash payload back to editor content.
 *
 * @param encoded  The URL-safe base64 string from the hash.
 * @returns        The original editor text.
 * @throws         If the string is not valid base64 or decompression fails.
 */
export function decodeConfig(encoded: string): string {
  const compressed = fromBase64url(encoded);
  const bytes = inflate(compressed);
  return new TextDecoder().decode(bytes);
}

/**
 * Estimate the full URL length if the given content were encoded and placed
 * in a `#config=` hash parameter.
 *
 * Useful for warning the user before generating an unreasonably long URL.
 * Most browsers support URLs up to ~2,000 characters (IE/Edge legacy) or
 * ~65,535+ characters (modern browsers).  Social media and messaging apps
 * often truncate around 2,000-4,000 characters.
 */
export function estimateShareUrlLength(content: string): number {
  const encoded = encodeConfig(content);
  // Base URL (origin + pathname) + "#config=" + encoded payload
  const baseLength =
    window.location.origin.length + window.location.pathname.length;
  return baseLength + "#config=".length + encoded.length;
}

/** Suggested maximum URL length for broad compatibility. */
export const SHARE_URL_MAX_LENGTH = 8_000;

/**
 * Returns true if the estimated URL for the given content exceeds the
 * recommended maximum length.
 */
export function isShareUrlTooLong(content: string): boolean {
  return estimateShareUrlLength(content) > SHARE_URL_MAX_LENGTH;
}
