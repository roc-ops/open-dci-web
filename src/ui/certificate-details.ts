/**
 * Certificate Details Modal — displays human-readable X.509 certificate
 * information parsed from a hex-encoded CVC or certificate chain.
 *
 * Follows the same DOM construction pattern as src/ui/cvc-extract-result.ts:
 * backdrop -> modal -> header -> body -> footer.
 * CSS class prefix: `.cert-details-`.
 */

import type { CertificateInfo } from "../codec/certificate-parser";
import { createModal } from "./modal";

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
  const { propertyName, certificates } = options;

  const { modal, body, close } = createModal({
    cssPrefix: "cert-details",
    title: `Certificate Details \u2014 ${propertyName}`,
    container,
  });

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
  modal.appendChild(body);
  modal.appendChild(footer);
}
