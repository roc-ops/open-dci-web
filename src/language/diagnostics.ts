/**
 * Custom diagnostics — DOCSIS-specific validation beyond JSON Schema.
 *
 * Monaco's built-in JSON Schema validation handles structural and type
 * checking. This module is reserved for future DOCSIS-specific rules:
 * - Cross-field dependency validation
 * - TLV constraint checking
 * - DOCSIS version compatibility warnings
 */

/**
 * Registers custom DOCSIS diagnostics. Currently a no-op —
 * JSON Schema validation covers the baseline.
 */
export function registerDiagnostics(): void {
  // No-op for now. Future: subscribe to model changes and
  // run DOCSIS-specific validation rules.
}
