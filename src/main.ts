/**
 * Application entry point.
 * Initializes the Monaco editor and wires up all modules.
 */
import "./style.css";
import { configureWorkers } from "./editor/worker";
import { registerTheme, THEME_NAME } from "./editor/theme";
import { createEditor } from "./editor/setup";
import { registerSchema, getSchema } from "./schema/loader";
import { buildMetadataIndex } from "./schema/metadata";
import { registerHoverProvider } from "./language/hover-provider";
import { registerCompletionProvider } from "./language/completion-provider";
import { registerDiagnostics } from "./language/diagnostics";
import { createToolbar } from "./ui/toolbar";
import { createStatusBar, setStatusFileName } from "./ui/status-bar";
import { openFile } from "./file/open";
import { saveFile } from "./file/save";

// Default content shown when the editor first opens
const DEFAULT_CONTENT = `// OpenDCI DOCSIS Configuration
// Edit your config here — validation and auto-complete are active.
{
  "NetworkAccess": 1,
  "ServiceFlowDown": [
    {
      "ServiceFlowRef": 1,
      "QosParamSetType": 7,
      "MaxSustainedRate": 50000000
    }
  ],
  "ServiceFlowUp": [
    {
      "ServiceFlowRef": 2,
      "QosParamSetType": 7,
      "MaxSustainedRate": 10000000
    }
  ]
}
`;

function main(): void {
  const app = document.getElementById("app");
  if (!app) throw new Error("Missing #app element");

  // 1. Configure Monaco web workers
  configureWorkers();

  // 2. Register custom theme
  registerTheme();

  // 3. Register JSON Schema for validation/auto-complete
  registerSchema();

  // 4. Build metadata index for custom providers
  const schema = getSchema();
  const metadataIndex = buildMetadataIndex(schema);

  // 5. Register custom language providers
  registerHoverProvider(metadataIndex);
  registerCompletionProvider(metadataIndex);
  registerDiagnostics();

  // 6. Create UI
  let currentFileName = "untitled.jsonc";

  // Toolbar
  createToolbar(app, {
    onOpen: async () => {
      try {
        const result = await openFile();
        if (typeof result.content === "string") {
          editor.setValue(result.content);
          currentFileName = result.name;
          setStatusFileName(statusBar, currentFileName);
        } else {
          // Binary file — future: decode via codec module
          alert(
            `Binary file "${result.name}" loaded (${result.content.byteLength} bytes).\n\nBinary decoding is not yet implemented. Use a .jsonc file for now.`,
          );
        }
      } catch (e) {
        if (e instanceof Error && e.message !== "File selection cancelled") {
          console.error("Failed to open file:", e);
        }
      }
    },
    onSave: async () => {
      try {
        const content = editor.getValue();
        await saveFile(content, currentFileName);
      } catch (e) {
        if (e instanceof Error && e.message !== "File selection cancelled") {
          console.error("Failed to save file:", e);
        }
      }
    },
  });

  // Editor container
  const editorContainer = document.createElement("div");
  editorContainer.className = "editor-container";
  app.appendChild(editorContainer);

  // Create editor
  const editor = createEditor(editorContainer, DEFAULT_CONTENT);
  editor.updateOptions({ theme: THEME_NAME });

  // Status bar
  const statusBar = createStatusBar(app, editor);
  setStatusFileName(statusBar, currentFileName);
}

main();
