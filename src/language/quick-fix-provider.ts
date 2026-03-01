/**
 * Quick-fix provider — offers lightbulb actions for DOCSIS diagnostics.
 *
 * When the custom diagnostics (diagnostics.ts) produce warnings, this
 * provider parses the marker messages and offers appropriate fixes:
 *
 * - validValues warnings  -> "Change to [value] ([label])" for each valid value
 * - range warnings        -> "Change to [min]" or "Change to [max]"
 * - duplicate key warnings -> "Remove this property"
 */
import * as monaco from "monaco-editor";

/**
 * Registers a CodeActionProvider for the JSON language that provides
 * quick-fix actions for DOCSIS-specific diagnostic warnings.
 */
export function registerQuickFixProvider(): monaco.IDisposable {
  return monaco.languages.registerCodeActionProvider(
    "json",
    {
      provideCodeActions(
        model: monaco.editor.ITextModel,
        _range: monaco.Range,
        context: monaco.languages.CodeActionContext,
        _token: monaco.CancellationToken,
      ): monaco.languages.CodeActionList | undefined {
        const actions: monaco.languages.CodeAction[] = [];

        for (const marker of context.markers) {
          const msg = marker.message;

          // --- validValues fix ---
          const validValuesMatch = msg.match(
            /^Value .+ is not a recognized value for .+\. Valid values: (.+)$/,
          );
          if (validValuesMatch) {
            const validPart = validValuesMatch[1];
            // Parse entries like "1 (label1), 2 (label2)"
            const entryPattern = /(\S+) \(([^)]+)\)/g;
            let entry: RegExpExecArray | null;
            while ((entry = entryPattern.exec(validPart)) !== null) {
              const [, value, label] = entry;
              actions.push(
                makeReplaceAction(
                  `Change to ${value} (${label})`,
                  model,
                  marker,
                  value,
                ),
              );
            }
            continue;
          }

          // --- range fix ---
          const rangeMatch = msg.match(
            /^Value (\S+) is outside the allowed range (\d+)-(\d+) for .+\.$/,
          );
          if (rangeMatch) {
            const currentValue = Number(rangeMatch[1]);
            const min = Number(rangeMatch[2]);
            const max = Number(rangeMatch[3]);
            if (currentValue < min) {
              actions.push(
                makeReplaceAction(
                  `Change to ${min}`,
                  model,
                  marker,
                  String(min),
                ),
              );
            } else if (currentValue > max) {
              actions.push(
                makeReplaceAction(
                  `Change to ${max}`,
                  model,
                  marker,
                  String(max),
                ),
              );
            }
            continue;
          }

          // --- duplicate key fix ---
          if (msg.startsWith("Duplicate property ")) {
            const deleteAction = makeDeleteLineAction(
              "Remove this property",
              model,
              marker,
            );
            if (deleteAction) {
              actions.push(deleteAction);
            }
            continue;
          }
        }

        if (actions.length === 0) return undefined;

        return {
          actions,
          dispose() {},
        };
      },
    },
    {
      providedCodeActionKinds: ["quickfix"],
    },
  );
}

/**
 * Creates a CodeAction that replaces the marker range with a new value.
 */
function makeReplaceAction(
  title: string,
  model: monaco.editor.ITextModel,
  marker: monaco.editor.IMarkerData,
  newValue: string,
): monaco.languages.CodeAction {
  return {
    title,
    kind: "quickfix",
    edit: {
      edits: [
        {
          resource: model.uri,
          textEdit: {
            range: {
              startLineNumber: marker.startLineNumber,
              startColumn: marker.startColumn,
              endLineNumber: marker.endLineNumber,
              endColumn: marker.endColumn,
            },
            text: newValue,
          },
          versionId: model.getVersionId(),
        },
      ],
    },
    diagnostics: [marker],
  };
}

/**
 * Creates a CodeAction that removes the entire property line containing
 * the marker (key + value + trailing comma if present).
 *
 * The deletion range spans the full line so that no blank lines remain.
 * If the property has a trailing comma, it is included. If the property
 * is the last in the object (no trailing comma) but the preceding line
 * ends with a comma, the preceding comma is also removed to keep the
 * JSON valid.
 */
function makeDeleteLineAction(
  title: string,
  model: monaco.editor.ITextModel,
  marker: monaco.editor.IMarkerData,
): monaco.languages.CodeAction | undefined {
  const lineNumber = marker.startLineNumber;
  const lineContent = model.getLineContent(lineNumber);
  const totalLines = model.getLineCount();

  // Check if there is a trailing comma on the same line or the property spans to next line
  const trimmed = lineContent.trimEnd();
  const hasTrailingComma = trimmed.endsWith(",");

  let startLine: number;
  let startCol: number;
  let endLine: number;
  let endCol: number;

  if (lineNumber < totalLines) {
    // Delete the entire line including the newline character
    startLine = lineNumber;
    startCol = 1;
    endLine = lineNumber + 1;
    endCol = 1;
  } else {
    // Last line in the file — delete from end of previous line to end of this line
    if (lineNumber > 1) {
      const prevLine = model.getLineContent(lineNumber - 1);
      startLine = lineNumber - 1;
      startCol = prevLine.length + 1;
      endLine = lineNumber;
      endCol = lineContent.length + 1;
    } else {
      // Only line in the file
      startLine = 1;
      startCol = 1;
      endLine = 1;
      endCol = lineContent.length + 1;
    }
  }

  // If the deleted line has no trailing comma and the previous line ends
  // with a comma, remove the trailing comma from the previous line to
  // keep the JSON syntactically valid (this handles deleting the last
  // property in an object).
  if (!hasTrailingComma && lineNumber > 1) {
    const prevContent = model.getLineContent(lineNumber - 1);
    const prevTrimmed = prevContent.trimEnd();
    if (prevTrimmed.endsWith(",")) {
      // Extend deletion start to include the trailing comma on the
      // previous line. We delete from just before the comma through
      // the property line.
      const commaCol = prevTrimmed.length; // 1-based position of the comma
      startLine = lineNumber - 1;
      startCol = commaCol;
    }
  }

  return {
    title,
    kind: "quickfix",
    edit: {
      edits: [
        {
          resource: model.uri,
          textEdit: {
            range: {
              startLineNumber: startLine,
              startColumn: startCol,
              endLineNumber: endLine,
              endColumn: endCol,
            },
            text: "",
          },
          versionId: model.getVersionId(),
        },
      ],
    },
    diagnostics: [marker],
  };
}
