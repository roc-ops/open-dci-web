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
import { registerSnmpMibCodeLens } from "./language/snmp-mib-codelens";
import { registerChunkedHexCodeLens } from "./language/chunked-hex-codelens";
import { createToolbar } from "./ui/toolbar";
import { createStatusBar, setStatusFileName } from "./ui/status-bar";
import { createLoadingOverlay } from "./ui/loading-overlay";
import { initMibState, showMibModal } from "./ui/mib-manager";
import { initVendorSchemaState, showVendorSchemaModal } from "./ui/vendor-schema-manager";
import { openFile } from "./file/open";
import { saveFile, saveBinaryFile } from "./file/save";
import { initWasm, encode, decode, isReady } from "./codec/index";
import { detectPacketCable } from "./config-detect";
import { showToast } from "./ui/toast";
import { getHashParam, decodeConfig } from "./sharing";

/** Returns true if the error is a user-initiated file picker cancellation. */
function isPickerCancellation(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") return true;
  if (e instanceof Error && e.message === "File selection cancelled") return true;
  return false;
}

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

  // 6. Create UI
  let currentFileName = "untitled.jsonc";

  // Toolbar (encode/decode/MIBs start disabled until WASM is ready)
  const { setCodecReady, getSecret, setPacketCable, getPacketCableVariant } = createToolbar(app, {
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
            showToast("The codec is still loading. Please try again in a moment.", "info");
            return;
          }
          try {
            const secret = getSecret() || undefined;
            const jsonc = decode(result.content, secret);
            editor.setValue(jsonc);
            currentFileName = result.name.replace(/\.(bin|cm)$/i, ".jsonc");
            setStatusFileName(statusBar, currentFileName);
          } catch (decodeErr) {
            console.error("Decode error:", decodeErr);
            showToast("Could not decode the binary file. It may be corrupted or in an unsupported format.", "error");
          }
        }
      } catch (e) {
        if (!isPickerCancellation(e)) {
          console.error("Failed to open file:", e);
        }
      }
    },
    onSave: async () => {
      try {
        const content = editor.getValue();
        await saveFile(content, currentFileName);
      } catch (e) {
        if (!isPickerCancellation(e)) {
          console.error("Failed to save file:", e);
        }
      }
    },
    onEncode: async () => {
      try {
        const content = editor.getValue();
        const secret = getSecret() || undefined;
        const pcVariant = getPacketCableVariant();
        const binary = encode(content, secret, pcVariant);
        const binaryFileName = currentFileName.replace(/\.(jsonc|json)$/i, ".bin");
        await saveBinaryFile(binary, binaryFileName);
      } catch (e) {
        if (!isPickerCancellation(e)) {
          console.error("Encode error:", e);
          showToast("Encoding failed. Please check the configuration for errors.", "error");
        }
      }
    },
    onDecode: async () => {
      try {
        const result = await openFile();
        let binary: Uint8Array;
        if (typeof result.content === "string") {
          // If user selected a text file, convert to bytes
          binary = new TextEncoder().encode(result.content);
        } else {
          binary = result.content;
        }
        const secret = getSecret() || undefined;
        const jsonc = decode(binary, secret);
        editor.setValue(jsonc);
        currentFileName = result.name.replace(/\.(bin|cm)$/i, ".jsonc");
        setStatusFileName(statusBar, currentFileName);
      } catch (e) {
        if (!isPickerCancellation(e)) {
          console.error("Decode error:", e);
          showToast("Could not decode the selected file. It may be corrupted or in an unsupported format.", "error");
        }
      }
    },
    onMibManager: () => {
      showMibModal(app);
    },
    onVendorSchemaManager: () => {
      showVendorSchemaModal(app);
    },
  });

  // Editor container
  const editorContainer = document.createElement("div");
  editorContainer.className = "editor-container";
  app.appendChild(editorContainer);

  // Create editor
  const editor = createEditor(editorContainer, DEFAULT_CONTENT);
  editor.updateOptions({ theme: THEME_NAME });

  // 7b. Load config from URL hash (if present)
  const hashConfig = getHashParam("config");
  if (hashConfig) {
    try {
      const content = decodeConfig(hashConfig);
      if (content) {
        editor.setValue(content);
        currentFileName = "shared.jsonc";
      }
    } catch (e) {
      console.error("Failed to decode shared config from URL:", e);
      showToast(
        "Could not load the shared configuration. The link may be invalid or corrupted.",
        "error",
      );
    }
  }

  // 8. Register custom DOCSIS diagnostics (validValues checking)
  registerDiagnostics(editor, metadataIndex);

  // 9. Register comment updater for x-docsis-validValues
  registerCommentUpdater(editor, metadataIndex);

  // 9. Register auto-suggest trigger for comma/Enter/brace
  registerAutoSuggest(editor);

  // 10. Register SNMP MIB CodeLens (Add/Edit buttons on SnmpMibObject arrays)
  registerSnmpMibCodeLens(editor, app);

  // 10b. Register Chunked Hex CodeLens (Add/Edit buttons on chunked TLV properties)
  registerChunkedHexCodeLens(editor, app);

  // 11. Detect PacketCable config type and update toolbar on content changes
  const updateConfigDetection = () => {
    const content = editor.getValue();
    setPacketCable(detectPacketCable(content));
  };
  editor.onDidChangeModelContent(updateConfigDetection);
  updateConfigDetection();

  // Status bar
  const statusBar = createStatusBar(app, editor);
  setStatusFileName(statusBar, currentFileName);

  // 12. Initialize WASM codec with loading overlay
  const loading = createLoadingOverlay(app);
  initWasm((msg) => loading.setMessage(msg))
    .then(({ mibBundle, vendorSchemaBundle }) => {
      loading.dismiss();
      setCodecReady(true);
      initMibState(mibBundle);
      initVendorSchemaState(vendorSchemaBundle);
    })
    .catch((err) => {
      console.error("Failed to initialize WASM codec:", err);
      loading.dismiss();
      setCodecReady(false, err instanceof Error ? err.message : String(err));
    });
}

main();
