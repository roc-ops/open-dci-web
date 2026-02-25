/**
 * Toolbar — top bar with file operations and codec actions.
 */

export interface ToolbarCallbacks {
  onOpen: () => void;
  onSave: () => void;
  onEncode: () => void;
  onDecode: () => void;
  onMibManager: () => void;
}

export interface ToolbarResult {
  toolbar: HTMLElement;
  /** Call when WASM codec becomes ready (or fails). */
  setCodecReady: (ready: boolean, error?: string) => void;
}

/**
 * Creates the toolbar element and appends it to the container.
 * Encode/decode/MIBs buttons start disabled until setCodecReady(true) is called.
 */
export function createToolbar(
  container: HTMLElement,
  callbacks: ToolbarCallbacks,
): ToolbarResult {
  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";

  const openBtn = createButton("Open", callbacks.onOpen);
  const saveBtn = createButton("Save", callbacks.onSave);
  const encodeBtn = createButton("Encode", callbacks.onEncode, true);
  const decodeBtn = createButton("Decode", callbacks.onDecode, true);
  const mibsBtn = createButton("MIBs", callbacks.onMibManager, true);

  encodeBtn.title = "WASM codec is loading\u2026";
  decodeBtn.title = "WASM codec is loading\u2026";
  mibsBtn.title = "WASM codec is loading\u2026";

  const title = document.createElement("span");
  title.className = "toolbar-title";
  title.textContent = "OpenDCI Config Editor";

  const fileGroup = document.createElement("div");
  fileGroup.className = "toolbar-group";
  fileGroup.appendChild(openBtn);
  fileGroup.appendChild(saveBtn);

  const codecGroup = document.createElement("div");
  codecGroup.className = "toolbar-group";
  codecGroup.appendChild(encodeBtn);
  codecGroup.appendChild(decodeBtn);

  const mibGroup = document.createElement("div");
  mibGroup.className = "toolbar-group";
  mibGroup.appendChild(mibsBtn);

  toolbar.appendChild(title);
  toolbar.appendChild(fileGroup);
  toolbar.appendChild(codecGroup);
  toolbar.appendChild(mibGroup);
  container.appendChild(toolbar);

  function setCodecReady(ready: boolean, error?: string): void {
    encodeBtn.disabled = !ready;
    decodeBtn.disabled = !ready;
    mibsBtn.disabled = !ready;
    if (ready) {
      encodeBtn.title = "";
      decodeBtn.title = "";
      mibsBtn.title = "";
    } else {
      const msg = error
        ? `WASM codec failed to load: ${error}`
        : "WASM codec is loading\u2026";
      encodeBtn.title = msg;
      decodeBtn.title = msg;
      mibsBtn.title = msg;
    }
  }

  return { toolbar, setCodecReady };
}

function createButton(
  label: string,
  onClick: () => void,
  disabled = false,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "toolbar-btn";
  btn.textContent = label;
  btn.disabled = disabled;
  if (disabled) btn.title = "Coming soon";
  btn.addEventListener("click", onClick);
  return btn;
}
