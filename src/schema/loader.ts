/**
 * JSON Schema loader — registers the OpenDCI DOCSIS config and MTA schemas
 * with Monaco's JSON language service for validation and auto-complete.
 */
import * as monaco from "monaco-editor";
import docsisSchema from "./docsis-config.schema.json";
import mtaSchema from "./mta-config.schema.json";

/**
 * Registers the DOCSIS and MTA configuration JSON Schemas with Monaco.
 * Enables validation, auto-complete, and JSONC comment support.
 * Both schemas are registered so the editor recognizes CM and MTA TLV types.
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
      {
        uri: "https://opendci.org/schemas/mta-config.schema.json",
        fileMatch: [],
        schema: mtaSchema as Record<string, unknown>,
      },
    ],
  });
}

/** Returns the raw CM schema object for metadata extraction. */
export function getSchema(): Record<string, unknown> {
  return docsisSchema as Record<string, unknown>;
}

/** Returns the raw MTA schema object for metadata extraction. */
export function getMtaSchema(): Record<string, unknown> {
  return mtaSchema as Record<string, unknown>;
}
