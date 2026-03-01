/**
 * JSON Schema loader — registers the OpenDCI DOCSIS config and MTA schemas
 * with Monaco's JSON language service for validation and auto-complete.
 */
import * as monaco from "monaco-editor";
import type { ConfigFormat } from "../examples";
import docsisSchema from "./docsis-config.schema.json";
import mtaSchema from "./mta-config.schema.json";

let activeFormat: ConfigFormat = "cm";

const diagnosticBase = {
  validate: true,
  allowComments: true,
  trailingCommas: "warning" as monaco.languages.json.SeverityLevel,
};

/**
 * Registers the default (CM) JSON Schema with Monaco.
 * Called once at startup.
 */
export function registerSchema(): void {
  setActiveSchema("cm");
}

/**
 * Switch the active JSON Schema used for Monaco validation.
 * Calling with "mta" makes the MTA schema match all files;
 * calling with "cm" restores the CM schema as active.
 */
export function setActiveSchema(format: ConfigFormat): void {
  activeFormat = format;

  const cmMatch = format === "cm" ? ["*"] : [];
  const mtaMatch = format === "mta" ? ["*"] : [];

  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    ...diagnosticBase,
    schemas: [
      {
        uri: "https://opendci.org/schemas/docsis-config.schema.json",
        fileMatch: cmMatch,
        schema: docsisSchema as Record<string, unknown>,
      },
      {
        uri: "https://opendci.org/schemas/mta-config.schema.json",
        fileMatch: mtaMatch,
        schema: mtaSchema as Record<string, unknown>,
      },
    ],
  });
}

/** Returns the currently active config format. */
export function getActiveFormat(): ConfigFormat {
  return activeFormat;
}

/** Returns the raw CM schema object for metadata extraction. */
export function getSchema(): Record<string, unknown> {
  return docsisSchema as Record<string, unknown>;
}

/** Returns the raw MTA schema object for metadata extraction. */
export function getMtaSchema(): Record<string, unknown> {
  return mtaSchema as Record<string, unknown>;
}
