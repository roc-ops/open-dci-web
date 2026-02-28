/**
 * URL hash parameter parsing and building utility.
 *
 * Hash fragments use the format: #key1=value1&key2=value2
 * The browser never sends the hash to the server, making it ideal
 * for encoding state in a static GitHub Pages SPA.
 *
 * Designed to be extensible for future parameters such as:
 *   #config=  — compressed editor content
 *   #file=    — remote file URL
 *   #gist=    — GitHub Gist ID
 *   #url=     — arbitrary fetch URL
 *   &line=    — line number to scroll to
 *   &tlv=     — TLV type to highlight
 *   &highlight= — range to highlight
 */

/** A map of hash parameter keys to their (unescaped) values. */
export type HashParams = Record<string, string>;

/**
 * Parse `window.location.hash` (or a supplied hash string) into a
 * key-value map.
 *
 * - The leading `#` is stripped.
 * - Parameters are separated by `&`.
 * - Keys without a value (e.g. `#foo`) are stored with an empty string.
 * - Both keys and values are URI-decoded.
 */
export function parseHashParams(hash?: string): HashParams {
  const raw = hash ?? window.location.hash;
  const stripped = raw.startsWith("#") ? raw.slice(1) : raw;
  if (!stripped) return {};

  const params: HashParams = {};
  for (const segment of stripped.split("&")) {
    const eqIdx = segment.indexOf("=");
    if (eqIdx === -1) {
      // Bare key with no value
      params[decodeURIComponent(segment)] = "";
    } else {
      const key = decodeURIComponent(segment.slice(0, eqIdx));
      const value = decodeURIComponent(segment.slice(eqIdx + 1));
      params[key] = value;
    }
  }
  return params;
}

/**
 * Build a hash string (including the leading `#`) from a key-value map.
 * Empty-string values produce bare keys (e.g. `#foo`).
 * Returns an empty string if the map is empty.
 */
export function buildHash(params: HashParams): string {
  const entries = Object.entries(params).filter(
    ([key]) => key.length > 0,
  );
  if (entries.length === 0) return "";

  const segments = entries.map(([key, value]) => {
    const encodedKey = encodeURIComponent(key);
    if (value === "") return encodedKey;
    return `${encodedKey}=${encodeURIComponent(value)}`;
  });

  return `#${segments.join("&")}`;
}

/**
 * Update the browser's hash without triggering a page reload.
 * Uses `history.replaceState` so the change does not create a new
 * history entry (avoids polluting the back button).
 */
export function updateHash(params: HashParams): void {
  const hash = buildHash(params);
  const url = hash
    ? `${window.location.pathname}${window.location.search}${hash}`
    : `${window.location.pathname}${window.location.search}`;
  history.replaceState(null, "", url);
}

/**
 * Convenience helper: read a single hash parameter from the current URL.
 * Returns `undefined` when the key is not present.
 */
export function getHashParam(key: string): string | undefined {
  const params = parseHashParams();
  return Object.prototype.hasOwnProperty.call(params, key)
    ? params[key]
    : undefined;
}
