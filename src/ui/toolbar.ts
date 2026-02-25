/**
 * Toolbar — top bar with file operations and codec actions.
 */

export interface ToolbarCallbacks {
  onOpen: () => void;
  onSave: () => void;
  onEncode: () => void;
  onDecode: () => void;
}

/**
 * Creates the toolbar element and appends it to the container.
 * Returns the toolbar element for styling purposes.
 */
export function createToolbar(
  container: HTMLElement,
  callbacks: ToolbarCallbacks,
): HTMLElement {
  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";

  const openBtn = createButton("Open", callbacks.onOpen);
  const saveBtn = createButton("Save", callbacks.onSave);
  const encodeBtn = createButton("Encode", callbacks.onEncode);
  const decodeBtn = createButton("Decode", callbacks.onDecode);

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

  toolbar.appendChild(title);
  toolbar.appendChild(fileGroup);
  toolbar.appendChild(codecGroup);
  container.appendChild(toolbar);

  return toolbar;
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
