/**
 * Shared modal utility — creates the common boilerplate for modal dialogs:
 * backdrop, modal container, header with title and close button, body div,
 * Escape key handler, and backdrop click-to-close.
 *
 * Each caller passes a CSS prefix so existing class names are preserved.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateModalOptions {
  /** CSS class prefix used to generate element class names.
   *  e.g. "hex-input" produces "hex-input-backdrop", "hex-input-modal", etc. */
  cssPrefix: string;

  /** Title text shown in the header. */
  title: string;

  /** The container element the backdrop is appended to. */
  container: HTMLElement;

  /**
   * Optional override for the modal div class name.
   * Defaults to `${cssPrefix}-modal`.
   * Use this when the existing CSS class doesn't follow the `-modal` suffix
   * convention (e.g. "mib-modal" instead of "mib-modal-modal").
   */
  modalClass?: string;
}

export interface ModalElements {
  /** Full-screen backdrop overlay. */
  backdrop: HTMLDivElement;
  /** Modal container div (direct child of backdrop). */
  modal: HTMLDivElement;
  /** Header div containing the title and close button. */
  header: HTMLDivElement;
  /** Title span element — callers can modify textContent after creation. */
  titleEl: HTMLSpanElement;
  /** Body div — callers append their content here. */
  body: HTMLDivElement;
  /** Removes the backdrop and cleans up the Escape key listener. */
  close: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let modalIdCounter = 0;

const FOCUSABLE_SELECTOR =
  'button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create and mount a modal with standard boilerplate.
 *
 * Handles:
 * - Removing any previous modal with the same backdrop class
 * - Backdrop creation and appending to `container`
 * - Modal div with configurable CSS class
 * - Header with title text and close button (x)
 * - Body div for caller content
 * - Escape key handler (document-level keydown)
 * - Backdrop click-to-close
 * - Focus trapping (Tab / Shift+Tab cycle within modal)
 * - Focus restoration on close
 *
 * Returns the key DOM elements and a `close()` function so the caller
 * can assemble additional sections (footer, controls, etc.) and trigger
 * close from save/cancel buttons.
 */
export function createModal(options: CreateModalOptions): ModalElements {
  const { cssPrefix, title, container } = options;
  const modalClass = options.modalClass ?? `${cssPrefix}-modal`;

  // Capture the element that had focus before the modal opened
  const previouslyFocused = document.activeElement as HTMLElement | null;

  // Remove any existing instance
  const existing = container.querySelector(`.${cssPrefix}-backdrop`);
  if (existing) existing.remove();

  // --- Backdrop ---
  const backdrop = document.createElement("div");
  backdrop.className = `${cssPrefix}-backdrop`;

  // --- Modal ---
  const modal = document.createElement("div");
  modal.className = modalClass;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");

  // --- Header ---
  const header = document.createElement("div");
  header.className = `${cssPrefix}-header`;

  const titleId = `modal-title-${++modalIdCounter}`;
  const titleEl = document.createElement("span");
  titleEl.className = `${cssPrefix}-title`;
  titleEl.id = titleId;
  titleEl.textContent = title;

  modal.setAttribute("aria-labelledby", titleId);

  const closeBtn = document.createElement("button");
  closeBtn.className = `${cssPrefix}-close`;
  closeBtn.textContent = "\u00d7";
  closeBtn.setAttribute("aria-label", "Close dialog");
  closeBtn.addEventListener("click", () => close());

  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  // --- Body ---
  const body = document.createElement("div");
  body.className = `${cssPrefix}-body`;

  // --- Assemble (header + body only — caller adds footer/controls) ---
  modal.appendChild(header);
  // Body is returned but NOT appended here; the caller controls ordering
  // (some modals insert search bars, controls, etc. between header and body).

  backdrop.appendChild(modal);
  container.appendChild(backdrop);

  // --- Close logic ---
  function close(): void {
    backdrop.remove();
    document.removeEventListener("keydown", keyHandler);
    // Restore focus to the element that was focused before the modal opened
    if (previouslyFocused && typeof previouslyFocused.focus === "function") {
      previouslyFocused.focus();
    }
  }

  function keyHandler(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      close();
      return;
    }

    // Focus trap: cycle Tab / Shift+Tab within modal
    if (e.key === "Tab") {
      const focusable = Array.from(
        modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first || !modal.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last || !modal.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }

  document.addEventListener("keydown", keyHandler);

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  return { backdrop, modal, header, titleEl, body, close };
}
