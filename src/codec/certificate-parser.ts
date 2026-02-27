/**
 * Certificate Parser — converts DER-encoded hex strings into
 * human-readable certificate details using @peculiar/x509.
 */
import { X509Certificate } from "@peculiar/x509";

export interface CertificateInfo {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  serialNumber: string;
  signatureAlgorithm: string;
  publicKeyAlgorithm: string;
}

/** Convert a hex string to a Uint8Array. */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s/g, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

/** Format a Date as a readable string. */
function formatDate(date: Date): string {
  return date.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

/**
 * Split concatenated DER-encoded certificates from a single byte buffer.
 * Each DER certificate starts with 0x30 (SEQUENCE tag) followed by a
 * length encoding. We parse the length to find where each cert ends.
 */
function splitDerCertificates(data: Uint8Array): Uint8Array[] {
  const certs: Uint8Array[] = [];
  let offset = 0;

  while (offset < data.length) {
    if (data[offset] !== 0x30) break; // Not a SEQUENCE tag

    // Parse ASN.1 length
    let lengthBytes = 1;
    let contentLength: number;

    const firstLenByte = data[offset + 1];
    if (firstLenByte < 0x80) {
      // Short form: length is the byte itself
      contentLength = firstLenByte;
    } else {
      // Long form: first byte tells how many bytes encode the length
      const numLenBytes = firstLenByte & 0x7f;
      lengthBytes = 1 + numLenBytes;
      contentLength = 0;
      for (let i = 0; i < numLenBytes; i++) {
        contentLength = (contentLength << 8) | data[offset + 2 + i];
      }
    }

    const totalLength = 1 + lengthBytes + contentLength; // tag + length + content
    if (offset + totalLength > data.length) break;

    certs.push(data.slice(offset, offset + totalLength));
    offset += totalLength;
  }

  return certs;
}

/** Map OID-style algorithm names to human-readable names. */
function friendlyAlgorithmName(name: string): string {
  const map: Record<string, string> = {
    "RSA-PSS": "RSA-PSS",
    "RSASSA-PKCS1-v1_5": "RSA",
    rsaEncryption: "RSA",
    "SHA-256": "SHA-256",
    "SHA-1": "SHA-1",
    "SHA-384": "SHA-384",
    "SHA-512": "SHA-512",
    "EC": "ECDSA",
  };
  return map[name] || name;
}

/**
 * Parse a hex-encoded certificate (or concatenated certificate chain)
 * and return details for each certificate found.
 */
export function parseCertificateHex(hex: string): CertificateInfo[] {
  const bytes = hexToBytes(hex);
  const derCerts = splitDerCertificates(bytes);

  // If splitting found nothing, try parsing the whole buffer as one cert
  if (derCerts.length === 0) {
    derCerts.push(bytes);
  }

  const results: CertificateInfo[] = [];

  for (const der of derCerts) {
    try {
      const buf = new ArrayBuffer(der.byteLength);
      new Uint8Array(buf).set(der);
      const cert = new X509Certificate(buf);

      const sigAlg = cert.signatureAlgorithm;
      const pubKey = cert.publicKey.algorithm;

      results.push({
        subject: cert.subject || "(empty)",
        issuer: cert.issuer || "(empty)",
        validFrom: formatDate(cert.notBefore),
        validTo: formatDate(cert.notAfter),
        serialNumber: cert.serialNumber,
        signatureAlgorithm: friendlyAlgorithmName(sigAlg.name),
        publicKeyAlgorithm: friendlyAlgorithmName(pubKey.name),
      });
    } catch {
      results.push({
        subject: "(failed to parse certificate)",
        issuer: "",
        validFrom: "",
        validTo: "",
        serialNumber: "",
        signatureAlgorithm: "",
        publicKeyAlgorithm: "",
      });
    }
  }

  return results;
}
