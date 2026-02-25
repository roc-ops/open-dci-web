/**
 * Codec type definitions — interfaces for encoding/decoding DOCSIS binary config files.
 */

/** Encodes a JSONC config string into a DOCSIS binary config file. */
export interface Encoder {
  encode(jsonc: string): Uint8Array;
}

/** Decodes a DOCSIS binary config file into a JSONC config string. */
export interface Decoder {
  decode(binary: Uint8Array): string;
}
