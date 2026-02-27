/**
 * Certificate Details Modal — displays human-readable X.509 certificate
 * information parsed from a hex-encoded CVC or certificate chain.
 *
 * Follows the same DOM construction pattern as src/ui/cvc-extract-result.ts:
 * backdrop -> modal -> header -> body -> footer.
 * CSS class prefix: `.cert-details-`.
 */

import type { CertificateInfo } from "../codec/certificate-parser";

export interface CertificateDetailsOptions {
  /** The property name being inspected (e.g. "ManufacturerCvc"). */
  propertyName: string;
  /** Parsed certificate info for each cert in the chain. */
  certificates: CertificateInfo[];
}

/**
 * Show a modal displaying the parsed details of one or more certificates.
 */
export function showCertificateDetails(
  container: HTMLElement,
  options: CertificateDetailsOptions,
): void {
  // Remove any existing modal
  const existing = container.querySelector(".cert-details-backdrop");
  if (existing) existing.remove();

  const { propertyName, certificates } = options;

  // --- Backdrop ---
  const backdrop = document.createElement("div");
  backdrop.className = "cert-details-backdrop";

  const modal = document.createElement("div");
  modal.className = "cert-details-modal";

  // --- Header ---
  const header = document.createElement("div");
  header.className = "cert-details-header";

  const titleEl = document.createElement("span");
  titleEl.className = "cert-details-title";
  titleEl.textContent = `Certificate Details \u2014 ${propertyName}`;

  const closeBtn = document.createElement("button");
  closeBtn.className = "cert-details-close";
  closeBtn.textContent = "\u00d7";
  closeBtn.addEventListener("click", () => close());

  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  // --- Body ---
  const body = document.createElement("div");
  body.className = "cert-details-body";

  if (certificates.length === 0) {
    const empty = document.createElement("div");
    empty.className = "cert-details-empty";
    empty.textContent = "No certificates could be parsed from this value.";
    body.appendChild(empty);
  } else {
    for (let i = 0; i < certificates.length; i++) {
      const cert = certificates[i];
      const section = document.createElement("div");
      section.className = "cert-details-cert";

      if (certificates.length > 1) {
        const label = document.createElement("div");
        label.className = "cert-details-cert-label";
        label.textContent = `Certificate ${i + 1} of ${certificates.length}`;
        section.appendChild(label);
      }

      const fields: [string, string][] = [
        ["Subject", cert.subject],
        ["Issuer", cert.issuer],
        ["Valid From", cert.validFrom],
        ["Valid To", cert.validTo],
        ["Serial Number", cert.serialNumber],
        ["Signature Algorithm", cert.signatureAlgorithm],
        ["Public Key Algorithm", cert.publicKeyAlgorithm],
      ];

      for (const [label, value] of fields) {
        if (!value) continue;
        const row = document.createElement("div");
        row.className = "cert-details-field";

        const labelEl = document.createElement("span");
        labelEl.className = "cert-details-field-label";
        labelEl.textContent = label;

        const valueEl = document.createElement("span");
        valueEl.className = "cert-details-field-value";
        valueEl.textContent = value;

        row.appendChild(labelEl);
        row.appendChild(valueEl);
        section.appendChild(row);
      }

      body.appendChild(section);
    }
  }

  // --- Footer ---
  const footer = document.createElement("div");
  footer.className = "cert-details-footer";

  const closeFooterBtn = document.createElement("button");
  closeFooterBtn.className = "toolbar-btn cert-details-close-btn";
  closeFooterBtn.textContent = "Close";
  closeFooterBtn.addEventListener("click", () => close());

  footer.appendChild(closeFooterBtn);

  // --- Assemble ---
  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);
  backdrop.appendChild(modal);
  container.appendChild(backdrop);

  // --- Close handlers ---
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  function close(): void {
    backdrop.remove();
    document.removeEventListener("keydown", escHandler);
  }

  function escHandler(e: KeyboardEvent): void {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", escHandler);
}
