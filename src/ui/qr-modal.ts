/**
 * QR Code modal — displays a share URL as a scannable QR code alongside
 * the text URL with a copy button.
 *
 * Uses the `qrcode` package to render to a canvas element and the shared
 * `createModal()` utility for consistent modal boilerplate.
 */

import QRCode from "qrcode";
import { createModal } from "./modal";

/**
 * Show a modal containing a QR code for the given URL.
 *
 * @param container  The element to mount the modal backdrop into (usually `#app`).
 * @param url        The share URL to encode as a QR code.
 */
export function showQrModal(container: HTMLElement, url: string): void {
  const { modal, body, close } = createModal({
    cssPrefix: "qr",
    title: "Share via QR Code",
    container,
  });

  body.className = "qr-body";

  // --- QR canvas ---
  const canvas = document.createElement("canvas");
  canvas.className = "qr-canvas";
  body.appendChild(canvas);

  QRCode.toCanvas(canvas, url, {
    width: 256,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  }).catch((err: unknown) => {
    console.error("Failed to render QR code:", err);
    canvas.remove();
    const fallback = document.createElement("div");
    fallback.className = "qr-error";
    fallback.textContent = "Could not generate QR code.";
    body.insertBefore(fallback, body.firstChild);
  });

  // --- URL text ---
  const urlText = document.createElement("div");
  urlText.className = "qr-url";
  urlText.textContent = url;
  body.appendChild(urlText);

  // --- Copy button ---
  const copyBtn = document.createElement("button");
  copyBtn.className = "toolbar-btn qr-copy-btn";
  copyBtn.textContent = "Copy Link";
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(url).then(
      () => {
        copyBtn.textContent = "Copied!";
        setTimeout(() => {
          copyBtn.textContent = "Copy Link";
        }, 2000);
      },
      () => {
        copyBtn.textContent = "Failed";
        setTimeout(() => {
          copyBtn.textContent = "Copy Link";
        }, 2000);
      },
    );
  });
  body.appendChild(copyBtn);

  // Append body into modal (createModal returns body un-appended)
  modal.appendChild(body);

  // Auto-focus the close button for keyboard accessibility
  const closeBtn = modal.querySelector<HTMLElement>(".qr-close");
  if (closeBtn) closeBtn.focus();

  // Also allow closing via the copy button for convenience — not needed,
  // the modal already supports Escape and backdrop click via createModal.
  void close;
}
