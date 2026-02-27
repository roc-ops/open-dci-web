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

/**
 * If `data` starts with an ASN.1 SEQUENCE tag (0x30), strip the outer
 * tag and length bytes and return the inner content.  Returns null if
 * the data is not a SEQUENCE or is too short.
 */
function unwrapSequence(data: Uint8Array): Uint8Array | null {
  if (data.length < 2 || data[0] !== 0x30) return null;

  const firstLenByte = data[1];
  let headerLen: number;
  if (firstLenByte < 0x80) {
    headerLen = 2;
  } else {
    headerLen = 2 + (firstLenByte & 0x7f);
  }

  if (headerLen >= data.length) return null;
  return data.slice(headerLen);
}

/** OID bytes for PKCS#7 signedData (1.2.840.113549.1.7.2). */
const SIGNED_DATA_OID = new Uint8Array([
  0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02,
]);

/**
 * Read an ASN.1 tag + length at the given offset.
 * Returns the tag byte, total header length, and content length,
 * or null if the data is too short or malformed.
 */
function readAsn1Header(
  data: Uint8Array,
  offset: number,
): { tag: number; headerLen: number; contentLen: number } | null {
  if (offset + 1 >= data.length) return null;

  const tag = data[offset];
  const firstLenByte = data[offset + 1];
  let headerLen: number;
  let contentLen: number;

  if (firstLenByte < 0x80) {
    headerLen = 2;
    contentLen = firstLenByte;
  } else {
    const numLenBytes = firstLenByte & 0x7f;
    if (numLenBytes === 0 || offset + 2 + numLenBytes > data.length) return null;
    headerLen = 2 + numLenBytes;
    contentLen = 0;
    for (let i = 0; i < numLenBytes; i++) {
      contentLen = (contentLen << 8) | data[offset + 2 + i];
    }
  }

  if (offset + headerLen + contentLen > data.length) return null;
  return { tag, headerLen, contentLen };
}

/**
 * If `data` is a degenerate PKCS#7 SignedData structure (the container
 * format DOCSIS uses for CVC certificate chains), extract the individual
 * DER-encoded certificates from inside it.  Returns null if the data
 * is not PKCS#7.
 *
 * Structure: SEQUENCE { OID signedData, [0] { SEQUENCE (SignedData) {
 *   INTEGER, SET, SEQUENCE, [0] (certificates) { cert, cert, ... }, SET } } }
 */
function extractCertsFromPkcs7(data: Uint8Array): Uint8Array[] | null {
  // Outer must be SEQUENCE
  const outer = readAsn1Header(data, 0);
  if (!outer || outer.tag !== 0x30) return null;

  let pos = outer.headerLen;

  // First child: OID — must be signedData
  const oid = readAsn1Header(data, pos);
  if (!oid || oid.tag !== 0x06 || oid.contentLen !== SIGNED_DATA_OID.length)
    return null;
  for (let i = 0; i < SIGNED_DATA_OID.length; i++) {
    if (data[pos + oid.headerLen + i] !== SIGNED_DATA_OID[i]) return null;
  }
  pos += oid.headerLen + oid.contentLen;

  // [0] EXPLICIT wrapper around SignedData content
  const explicit0 = readAsn1Header(data, pos);
  if (!explicit0 || explicit0.tag !== 0xa0) return null;
  pos += explicit0.headerLen;

  // SEQUENCE (SignedData)
  const signedData = readAsn1Header(data, pos);
  if (!signedData || signedData.tag !== 0x30) return null;
  const sdEnd = pos + signedData.headerLen + signedData.contentLen;
  pos += signedData.headerLen;

  // Walk SignedData children looking for certificates [0] (tag 0xA0)
  while (pos < sdEnd) {
    const elem = readAsn1Header(data, pos);
    if (!elem) break;

    if (elem.tag === 0xa0) {
      // certificates [0] IMPLICIT — contents are concatenated DER certs
      const certsData = data.slice(
        pos + elem.headerLen,
        pos + elem.headerLen + elem.contentLen,
      );
      if (certsData.length > 0 && certsData[0] === 0x30) {
        return splitDerCertificates(certsData);
      }
    }

    pos += elem.headerLen + elem.contentLen;
  }

  return null;
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

/** Parse a single DER-encoded certificate into a CertificateInfo. Throws on failure. */
function parseSingleDer(der: Uint8Array): CertificateInfo {
  const buf = new ArrayBuffer(der.byteLength);
  new Uint8Array(buf).set(der);
  const cert = new X509Certificate(buf);

  return {
    subject: cert.subject || "(empty)",
    issuer: cert.issuer || "(empty)",
    validFrom: formatDate(cert.notBefore),
    validTo: formatDate(cert.notAfter),
    serialNumber: cert.serialNumber,
    signatureAlgorithm: friendlyAlgorithmName(cert.signatureAlgorithm.name),
    publicKeyAlgorithm: friendlyAlgorithmName(cert.publicKey.algorithm.name),
  };
}

/**
 * Parse a hex-encoded certificate (or concatenated certificate chain)
 * and return details for each certificate found.
 *
 * Handles these formats:
 *  1. A single DER-encoded certificate
 *  2. Concatenated DER-encoded certificates (back-to-back)
 *  3. Degenerate PKCS#7 SignedData (DOCSIS CVC chain format)
 *  4. Bare ASN.1 SEQUENCE wrapping multiple certificates
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
      results.push(parseSingleDer(der));
    } catch {
      // Parsing failed — the data may be in a container format:
      //  - Degenerate PKCS#7 SignedData (DOCSIS CVC chain format)
      //  - Bare ASN.1 SEQUENCE wrapping concatenated certificates
      let innerCerts = extractCertsFromPkcs7(der);
      if (!innerCerts) {
        const inner = unwrapSequence(der);
        if (inner) {
          const split = splitDerCertificates(inner);
          if (split.length > 0) innerCerts = split;
        }
      }

      if (innerCerts && innerCerts.length > 0) {
        for (const innerDer of innerCerts) {
          try {
            results.push(parseSingleDer(innerDer));
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
        continue;
      }

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
