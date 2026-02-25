/**
 * JSON Schema loader — registers the OpenDCI DOCSIS config schema
 * with Monaco's JSON language service for validation and auto-complete.
 */
import * as monaco from "monaco-editor";
import docsisSchema from "./docsis-config.schema.json";

/**
 * Registers the DOCSIS configuration JSON Schema with Monaco.
 * Enables validation, auto-complete, and JSONC comment support.
 */
export function registerSchema(): void {
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: true,
    trailingCommas: "warning" as monaco.languages.json.SeverityLevel,
    schemas: [
      {
        uri: "https://opendci.org/schemas/docsis-config.schema.json",
        fileMatch: ["*"],
        schema: docsisSchema as Record<string, unknown>,
      },
    ],
  });
}

/** Returns the raw schema object for metadata extraction. */
export function getSchema(): Record<string, unknown> {
  return docsisSchema as Record<string, unknown>;
}
