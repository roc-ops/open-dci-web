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
import { registerPropertyCompletionProvider } from "./language/property-completion-provider";
import { registerDiagnostics } from "./language/diagnostics";
import { registerCommentUpdater } from "./language/comment-updater";
import { registerAutoSuggest } from "./language/auto-suggest";
import { createToolbar } from "./ui/toolbar";
import { createStatusBar, setStatusFileName } from "./ui/status-bar";
import { openFile } from "./file/open";
import { saveFile, saveBinaryFile } from "./file/save";
import { initWasm, encode, decode, isReady } from "./codec/index";

// Default content shown when the editor first opens
const DEFAULT_CONTENT = `{
  "DownstreamServiceFlow": [
    {
      "DataRateUnitSetting": 2, // mega-bits per second (Mbps)
      "MaxSustainedTrafficRate": 1000,
      "MaxTrafficBurst": 750000,
      "QosParamSetType": 7, // provisioned, admitted, and active set
      "ServiceFlowReference": 20
    }
  ],
  "MaxNumCpes": 1,
  "NetworkAccess": 1, // enabled
  "UpstreamServiceFlow": [
    {
      "DataRateUnitSetting": 2, // mega-bits per second (Mbps)
      "MaxSustainedTrafficRate": 1000,
      "MaxTrafficBurst": 750000,
      "QosParamSetType": 7, // provisioned, admitted, and active set
      "ServiceFlowReference": 10
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
  registerPropertyCompletionProvider();
  registerDiagnostics();

  // 6. Initialize WASM codec in the background
  initWasm().catch((err) => {
    console.error("Failed to initialize WASM codec:", err);
  });

  // 7. Create UI
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
          // Binary file — decode via WASM codec
          if (!isReady()) {
            alert("WASM codec is still loading. Please try again in a moment.");
            return;
          }
          try {
            const jsonc = decode(result.content);
            editor.setValue(jsonc);
            currentFileName = result.name.replace(/\.(bin|cm)$/i, ".jsonc");
            setStatusFileName(statusBar, currentFileName);
          } catch (decodeErr) {
            console.error("Decode error:", decodeErr);
            alert(
              `Failed to decode binary file "${result.name}":\n${decodeErr instanceof Error ? decodeErr.message : String(decodeErr)}`,
            );
          }
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
    onEncode: async () => {
      if (!isReady()) {
        alert("WASM codec is still loading. Please try again in a moment.");
        return;
      }
      try {
        const content = editor.getValue();
        const binary = encode(content);
        const binaryFileName = currentFileName.replace(/\.(jsonc|json)$/i, ".bin");
        await saveBinaryFile(binary, binaryFileName);
      } catch (e) {
        console.error("Encode error:", e);
        alert(
          `Failed to encode config:\n${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
    onDecode: async () => {
      if (!isReady()) {
        alert("WASM codec is still loading. Please try again in a moment.");
        return;
      }
      try {
        const result = await openFile();
        let binary: Uint8Array;
        if (typeof result.content === "string") {
          // If user selected a text file, convert to bytes
          binary = new TextEncoder().encode(result.content);
        } else {
          binary = result.content;
        }
        const jsonc = decode(binary);
        editor.setValue(jsonc);
        currentFileName = result.name.replace(/\.(bin|cm)$/i, ".jsonc");
        setStatusFileName(statusBar, currentFileName);
      } catch (e) {
        if (e instanceof Error && e.message === "File selection cancelled") return;
        console.error("Decode error:", e);
        alert(
          `Failed to decode file:\n${e instanceof Error ? e.message : String(e)}`,
        );
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

  // 8. Register comment updater for x-docsis-validValues
  registerCommentUpdater(editor, metadataIndex);

  // 9. Register auto-suggest trigger for comma/Enter/brace
  registerAutoSuggest(editor);

  // Status bar
  const statusBar = createStatusBar(app, editor);
  setStatusFileName(statusBar, currentFileName);
}

main();
