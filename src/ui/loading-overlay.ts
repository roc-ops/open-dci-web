/**
 * Loading overlay — shown during WASM/MIB initialization.
 */

export interface LoadingOverlay {
  /** Update the status message. */
  setMessage: (msg: string) => void;
  /** Remove the overlay from the DOM. */
  dismiss: () => void;
}

/**
 * Creates a full-screen loading overlay and appends it to the container.
 */
export function createLoadingOverlay(container: HTMLElement): LoadingOverlay {
  const overlay = document.createElement("div");
  overlay.className = "loading-overlay";
  overlay.setAttribute("role", "alert");
  overlay.setAttribute("aria-busy", "true");

  const content = document.createElement("div");
  content.className = "loading-content";

  const spinner = document.createElement("div");
  spinner.className = "loading-spinner";

  const message = document.createElement("div");
  message.className = "loading-message";
  message.textContent = "Initializing\u2026";

  content.appendChild(spinner);
  content.appendChild(message);
  overlay.appendChild(content);
  container.appendChild(overlay);

  return {
    setMessage(msg: string) {
      message.textContent = msg;
    },
    dismiss() {
      overlay.classList.add("loading-overlay-fade-out");
      overlay.addEventListener("animationend", () => overlay.remove());
    },
  };
}
