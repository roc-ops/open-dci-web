/**
 * Types for OpenDCI x-docsis-* JSON Schema extensions.
 * These custom metadata properties appear on schema definitions
 * and power the custom hover/completion providers.
 */

export interface DocsisSchemaExtensions {
  /** Reference to the relevant DOCSIS specification document. */
  "x-docsis-spec"?: string;
  /** TLV type identifier (e.g., "24.9" for ServiceFlowDown.MaxSustainedRate). */
  "x-docsis-tlvType"?: string;
  /** Wire encoding data type (e.g., "uint8", "hexstring", "ipv4Address"). */
  "x-docsis-dataType"?: string;
  /** Mapping of valid numeric values to human-readable labels. */
  "x-docsis-validValues"?: Record<string, string>;
  /** Default value per the DOCSIS specification. */
  "x-docsis-default"?: unknown;
  /** Whether this TLV can appear multiple times. */
  "x-docsis-repeatable"?: boolean;
  /** Expected TLV length in bytes, or "variable". */
  "x-docsis-tlvLength"?: string | number;
}
