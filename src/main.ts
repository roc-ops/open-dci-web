/**
 * Application entry point.
 * Initializes the Monaco editor and wires up all modules.
 */
import "./style.css";
import { configureWorkers } from "./editor/worker";
import { registerTheme } from "./editor/theme";
import { initTheme } from "./theme-toggle";
import { createEditor } from "./editor/setup";
import { registerSchema, getSchema } from "./schema/loader";
import { buildMetadataIndex } from "./schema/metadata";
import { registerHoverProvider } from "./language/hover-provider";
import { registerCompletionProvider } from "./language/completion-provider";
import { registerPropertyCompletionProvider } from "./language/property-completion-provider";
import { registerDocumentSymbolProvider } from "./language/document-symbol-provider";
import { registerDiagnostics } from "./language/diagnostics";
import { registerCommentUpdater } from "./language/comment-updater";
import { registerAutoSuggest } from "./language/auto-suggest";
import { registerSnmpMibCodeLens } from "./language/snmp-mib-codelens";
import { registerChunkedHexCodeLens } from "./language/chunked-hex-codelens";
import { registerCopyTlvPathAction } from "./language/copy-tlv-path-action";
import { registerKeyboardShortcuts } from "./keyboard-shortcuts";
import { createToolbar } from "./ui/toolbar";
import { createStatusBar, setStatusFileName, setStatusDirty, onToggleProblems } from "./ui/status-bar";
import { createProblemsPanel } from "./ui/problems-panel";
import { createLoadingOverlay } from "./ui/loading-overlay";
import { initMibState, addUserMibs, replaceAllMibs, showMibModal } from "./ui/mib-manager";
import { invalidateMibBrowserCache } from "./ui/mib-browser";
import { initVendorSchemaState, addUserSchema, showVendorSchemaModal } from "./ui/vendor-schema-manager";
import { openFile, openBinaryFile } from "./file/open";
import { registerDropHandler } from "./file/drop";
import { saveFile, saveBinaryFile } from "./file/save";
import { initWasm, encode, decode, isReady } from "./codec/index";
import { detectPacketCable } from "./config-detect";
import { showToast } from "./ui/toast";
import {
  getHashParam,
  decodeConfig,
  encodeConfig,
  buildHash,
  fetchFromRepo,
  fetchFromGist,
  fetchFromUrl,
  fetchMibBundle,
  fetchVendorSchemas,
  filenameFromUrl,
  filenameFromPath,
  applyDeepLink,
} from "./sharing";

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
  registerDocumentSymbolProvider();

  // 6. Create UI
  let currentFileName = "untitled.jsonc";
  let statusBar: ReturnType<typeof createStatusBar>;
  let markClean: () => void = () => {};

  // Action handlers (shared between toolbar buttons and keyboard shortcuts)
  const actions = {
    onOpen: async () => {
      try {
        const result = await openFile();
        if (typeof result.content === "string") {
          editor.setValue(result.content);
          currentFileName = result.name;
          setStatusFileName(statusBar, currentFileName);
          markClean();
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
            markClean();
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
        markClean();
      } catch (e) {
        if (!isPickerCancellation(e)) {
          console.error("Failed to save file:", e);
        }
      }
    },
    onShare: async () => {
      try {
        const content = editor.getValue();
        const encoded = encodeConfig(content);
        const baseLength =
          window.location.origin.length + window.location.pathname.length;
        if (baseLength + "#config=".length + encoded.length > 8_000) {
          showToast(
            "This config is very large — the link may not work in all browsers. Consider using a gist or file instead.",
            "warning",
          );
        }
        const hashParams: Record<string, string> = { config: encoded };
        const position = editor.getPosition();
        if (position && !(position.lineNumber === 1 && position.column === 1)) {
          hashParams.line = String(position.lineNumber);
        }
        const url =
          window.location.origin +
          window.location.pathname +
          buildHash(hashParams);
        await navigator.clipboard.writeText(url);
        showToast("Link copied to clipboard!", "success");
      } catch (e) {
        console.error("Failed to copy share link:", e);
        showToast("Failed to copy link to clipboard.", "error");
      }
    },
    onFormat: () => {
      editor.getAction("editor.action.formatDocument")?.run();
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
        const result = await openBinaryFile();
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
        markClean();
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
    onThemeToggle: () => {
      // Wired up after editor creation below
    },
  };

  // Toolbar (encode/decode/MIBs start disabled until WASM is ready)
  const { setCodecReady, getSecret, setPacketCable, getPacketCableVariant, updateThemeButton } = createToolbar(app, actions);

  // Editor container
  const editorContainer = document.createElement("div");
  editorContainer.className = "editor-container";
  app.appendChild(editorContainer);

  // Create editor
  const editor = createEditor(editorContainer, DEFAULT_CONTENT);

  // Apply saved/detected theme and wire up toggle
  const themeManager = initTheme(editor);
  updateThemeButton(themeManager.getCurrentTheme());
  actions.onThemeToggle = () => {
    themeManager.toggle();
    updateThemeButton(themeManager.getCurrentTheme());
  };

  // Drag-and-drop file support
  registerDropHandler({
    container: editorContainer,
    onTextFile: (name, content) => {
      editor.setValue(content);
      currentFileName = name;
      setStatusFileName(statusBar, currentFileName);
      markClean();
    },
    onBinaryFile: (name, binary) => {
      if (!isReady()) {
        showToast("The codec is still loading. Please try again in a moment.", "info");
        return;
      }
      try {
        const secret = getSecret() || undefined;
        const jsonc = decode(binary, secret);
        editor.setValue(jsonc);
        currentFileName = name.replace(/\.(bin|cm|cfg)$/i, ".jsonc");
        setStatusFileName(statusBar, currentFileName);
        markClean();
      } catch (err) {
        console.error("Decode error:", err);
        showToast("Could not decode the dropped file. It may be corrupted or in an unsupported format.", "error");
      }
    },
    onError: (msg) => showToast(msg, "error"),
  });

  // 7b. Load config from URL hash (if present)
  // #config= takes priority (synchronous, inline-encoded content).
  // Otherwise check for remote sources: #file=, #gist=, #url= (async fetch).
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
    applyDeepLink(editor);
  } else {
    const hashFile = getHashParam("file");
    const hashGist = getHashParam("gist");
    const hashUrl = getHashParam("url");

    if (hashFile) {
      showToast("Loading config from GitHub repo\u2026", "info");
      fetchFromRepo(hashFile)
        .then((content) => {
          editor.setValue(content);
          currentFileName = filenameFromPath(hashFile);
          if (statusBar) setStatusFileName(statusBar, currentFileName);
          showToast("Config loaded successfully.", "success");
          applyDeepLink(editor);
        })
        .catch((err) => {
          console.error("Failed to load file from repo:", err);
          showToast(
            `Could not load file from repo: ${err instanceof Error ? err.message : String(err)}`,
            "error",
          );
        });
    } else if (hashGist) {
      showToast("Loading config from GitHub Gist\u2026", "info");
      fetchFromGist(hashGist)
        .then(({ content, filename }) => {
          editor.setValue(content);
          currentFileName = filename;
          if (statusBar) setStatusFileName(statusBar, currentFileName);
          showToast("Config loaded successfully.", "success");
          applyDeepLink(editor);
        })
        .catch((err) => {
          console.error("Failed to load Gist:", err);
          showToast(
            `Could not load Gist: ${err instanceof Error ? err.message : String(err)}`,
            "error",
          );
        });
    } else if (hashUrl) {
      showToast("Loading config from URL\u2026", "info");
      fetchFromUrl(hashUrl)
        .then((content) => {
          editor.setValue(content);
          currentFileName = filenameFromUrl(hashUrl);
          if (statusBar) setStatusFileName(statusBar, currentFileName);
          showToast("Config loaded successfully.", "success");
          applyDeepLink(editor);
        })
        .catch((err) => {
          console.error("Failed to load from URL:", err);
          showToast(
            `Could not load from URL: ${err instanceof Error ? err.message : String(err)}`,
            "error",
          );
        });
    } else {
      // No remote content params — apply deep link to default content
      applyDeepLink(editor);
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

  // 10c. Register "Copy TLV Path" right-click context menu action
  registerCopyTlvPathAction(editor);

  // 10d. Register keyboard shortcuts (Ctrl+O, Ctrl+S, Ctrl+Shift+S, Ctrl+Shift+L)
  registerKeyboardShortcuts(editor, actions);

  // 11. Detect PacketCable config type and update toolbar on content changes (300ms debounce)
  let configDetectTimer: ReturnType<typeof setTimeout> | undefined;
  const updateConfigDetection = () => {
    const content = editor.getValue();
    setPacketCable(detectPacketCable(content));
  };
  editor.onDidChangeModelContent(() => {
    clearTimeout(configDetectTimer);
    configDetectTimer = setTimeout(updateConfigDetection, 300);
  });
  updateConfigDetection();

  // Problems panel (between editor and status bar)
  const problemsPanel = createProblemsPanel(app, editor);

  // Status bar
  statusBar = createStatusBar(app, editor);
  setStatusFileName(statusBar, currentFileName);

  // Wire status bar errors click to toggle problems panel
  onToggleProblems(statusBar, problemsPanel.toggle);

  // 12. Unsaved changes tracking
  let dirty = false;
  const markDirty = () => {
    if (!dirty) {
      dirty = true;
      setStatusDirty(statusBar, true);
    }
  };
  markClean = () => {
    dirty = false;
    setStatusDirty(statusBar, false);
  };
  editor.onDidChangeModelContent(markDirty);
  window.addEventListener("beforeunload", (e) => {
    if (dirty) {
      e.preventDefault();
    }
  });

  // 13. Initialize WASM codec with loading overlay
  const loading = createLoadingOverlay(app);
  initWasm((msg) => loading.setMessage(msg))
    .then(async ({ mibBundle, vendorSchemaBundle }) => {
      loading.dismiss();
      setCodecReady(true);
      initMibState(mibBundle);
      initVendorSchemaState(vendorSchemaBundle);

      // Load custom MIBs from URL hash (augment or replace mode)
      const mibsReplace = getHashParam("mibs-replace");
      const mibsAugment = getHashParam("mibs");
      if (mibsReplace) {
        try {
          showToast("Loading custom MIB set\u2026", "info");
          const remoteMibs = await fetchMibBundle(mibsReplace);
          const count = replaceAllMibs(remoteMibs);
          invalidateMibBrowserCache();
          showToast(`Replaced bundled MIBs with ${count} custom MIBs.`, "success");
        } catch (err) {
          console.error("Failed to load custom MIBs:", err);
          showToast(
            `Could not load custom MIBs: ${err instanceof Error ? err.message : String(err)}`,
            "error",
          );
        }
      } else if (mibsAugment) {
        try {
          showToast("Loading additional MIBs\u2026", "info");
          const remoteMibs = await fetchMibBundle(mibsAugment);
          const count = addUserMibs(remoteMibs);
          invalidateMibBrowserCache();
          showToast(`Loaded ${count} additional MIBs.`, "success");
        } catch (err) {
          console.error("Failed to load additional MIBs:", err);
          showToast(
            `Could not load additional MIBs: ${err instanceof Error ? err.message : String(err)}`,
            "error",
          );
        }
      }

      // Load custom vendor schema from URL hash (augment mode)
      const vendorParam = getHashParam("vendor");
      if (vendorParam) {
        try {
          showToast("Loading custom vendor schema\u2026", "info");
          const vendorFiles = await fetchVendorSchemas(vendorParam);
          let loaded = 0;
          for (const [filename, content] of Object.entries(vendorFiles)) {
            try {
              addUserSchema(filename, content);
              loaded++;
            } catch (e) {
              console.warn(`Vendor schema ${filename} skipped:`, e);
            }
          }
          if (loaded > 0) {
            showToast(`Loaded ${loaded} vendor schema(s).`, "success");
          }
        } catch (err) {
          console.error("Failed to load vendor schema:", err);
          showToast(
            `Could not load vendor schema: ${err instanceof Error ? err.message : String(err)}`,
            "error",
          );
        }
      }
    })
    .catch((err) => {
      console.error("Failed to initialize WASM codec:", err);
      loading.dismiss();
      setCodecReady(false, err instanceof Error ? err.message : String(err));
    });
}

main();
