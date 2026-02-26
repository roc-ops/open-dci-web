# Upstream Change Request: Extract CVC Certificates from Signed Firmware

## Summary

Add a new WASM-exported function `opendciExtractCVC()` that accepts a signed cable modem firmware binary and extracts the embedded CVC (Code Verification Certificate) certificates, returning them as hex strings keyed by type.

## Motivation

The open-dci-web editor allows users to configure DOCSIS config files with CVC certificate TLVs (ManufacturerCvc, CoSignerCvc, ManufacturerCvcChain, CoSignerCvcChain). Users often have a signed firmware file but not the extracted certificate hex strings. Currently they must manually extract CVCs using OpenSSL or other tools. A WASM function that accepts the firmware binary and returns the CVC certificates would allow the web UI to offer a "Select Firmware File" button that auto-populates all applicable CVC TLVs.

## Background: DOCSIS CVC Certificates

Signed cable modem firmware files embed CVC certificates as part of the code signing process:

- **ManufacturerCvc** (TLV 32): The manufacturer's X.509 DER-encoded code verification certificate
- **CoSignerCvc** (TLV 33): Optional co-signer code verification certificate
- **ManufacturerCvcChain** (TLV 81, DOCSIS 3.1): Manufacturer CVC chain for Secure Software Download
- **CoSignerCvcChain** (TLV 82, DOCSIS 3.1): Co-signer CVC chain for Secure Software Download

These certificates are typically embedded at the front of the signed firmware file, either as part of a PKCS#7/CMS digital signature structure or in a manufacturer-specific header format.

## Proposed Change

### New WASM Export: `opendciExtractCVC`

**Input:** `Uint8Array` — the raw bytes of a signed cable modem firmware file

**Output:** JSON object with extracted certificates as hex strings:

```json
{
  "result": {
    "ManufacturerCvc": "30820362308202...",
    "CoSignerCvc": "308201C3308201...",
    "ManufacturerCvcChain": "30820485308203...",
    "CoSignerCvcChain": null
  },
  "error": ""
}
```

Fields that are not present in the firmware file should be `null` (not omitted), so the consumer knows which certificates were found vs which were absent.

### Suggested Go Implementation

**File:** `reference-implementation/wasm.go` (new function alongside existing `opendciDecode`)

```go
// opendciExtractCVC extracts CVC certificates from a signed CM firmware binary.
// Returns a JSON object with certificate hex strings keyed by type.
func opendciExtractCVC(this js.Value, args []js.Value) interface{} {
    if len(args) < 1 {
        return map[string]interface{}{"error": "expected firmware binary argument"}
    }

    data := make([]byte, args[0].Get("length").Int())
    js.CopyBytesToGo(data, args[0])

    certs, err := ExtractCVCFromFirmware(data)
    if err != nil {
        return map[string]interface{}{"error": err.Error()}
    }

    return map[string]interface{}{
        "result": certs,
    }
}
```

**File:** `reference-implementation/cvc.go` (new file)

The core extraction logic. This will need to:

1. Parse the signed firmware file header to locate the embedded certificate(s)
2. Extract the DER-encoded X.509 certificate data
3. Identify which type each certificate is (manufacturer vs co-signer, CVC vs chain)
4. Return them as hex-encoded strings

```go
// ExtractCVCFromFirmware parses a signed CM firmware binary and extracts
// any embedded CVC certificates.
func ExtractCVCFromFirmware(firmware []byte) (map[string]interface{}, error) {
    result := map[string]interface{}{
        "ManufacturerCvc":      nil,
        "CoSignerCvc":          nil,
        "ManufacturerCvcChain": nil,
        "CoSignerCvcChain":     nil,
    }

    // TODO: Parse the signed firmware format
    // - Locate the PKCS#7/CMS signature structure
    // - Extract signer certificates
    // - Classify as manufacturer/co-signer based on cert properties
    // - Encode as hex strings

    return result, nil
}
```

### Research Notes

The exact structure of signed CM firmware files varies. Key considerations:

- **PKCS#7/CMS**: Many signed firmware files use a standard CMS (Cryptographic Message Syntax) wrapper. Go's `go/pkcs7` or `crypto/x509` packages can parse these.
- **Proprietary headers**: Some manufacturers use proprietary headers before the firmware payload. The header typically contains the CVC certificate and digital signature.
- **Certificate classification**: Distinguishing ManufacturerCvc from CoSignerCvc may require examining the certificate's issuer chain or specific X.509 extensions defined in the DOCSIS PKI specification.
- **DOCSIS 3.1 SSD**: The CVC Chain types (TLV 81/82) contain full certificate chains rather than individual certificates.

## TypeScript Interface (Consumer Side)

```typescript
interface ExtractCVCResult {
  ManufacturerCvc: string | null;
  CoSignerCvc: string | null;
  ManufacturerCvcChain: string | null;
  CoSignerCvcChain: string | null;
}

// WASM function signature
declare function opendciExtractCVC(firmware: Uint8Array): {
  result?: ExtractCVCResult;
  error?: string;
};
```

## Backward Compatibility

- New function only — no existing APIs are modified
- No changes to existing decode/encode behavior
- The function is additive and optional (web UI feature)
