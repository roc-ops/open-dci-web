/**
 * Toast notification system — replaces browser alert() calls with styled,
 * auto-dismissing notifications that match the app's dark theme.
 */

export type ToastType = "error" | "warning" | "info" | "success";

/** Default auto-dismiss duration in milliseconds. */
const DISMISS_MS = 5000;

/**
 * Show a toast notification.  The toast slides in from the top-right,
 * auto-dismisses after 5 seconds, and can be closed early via its X button.
 */
export function showToast(message: string, type: ToastType = "info"): void {
  // Find or create the singleton container
  let container = document.querySelector<HTMLDivElement>(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const msg = document.createElement("span");
  msg.className = "toast-message";
  msg.textContent = message;
  toast.appendChild(msg);

  const close = document.createElement("button");
  close.className = "toast-close";
  close.textContent = "\u00d7";
  close.addEventListener("click", () => remove());
  toast.appendChild(close);

  container.appendChild(toast);

  const timer = setTimeout(() => remove(), DISMISS_MS);

  function remove() {
    clearTimeout(timer);
    if (!toast.parentNode) return;
    toast.classList.add("toast-fade-out");
    toast.addEventListener("animationend", () => toast.remove());
  }
}
