package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"
	"syscall/js"

	"github.com/roc-ops/opendci-web/wasm/codec"
)

//go:embed schemas/docsis-config.jtd.json
var schemaBytes []byte

func main() {
	// Initialize registry from embedded schema.
	reg, err := codec.LoadRegistryFromBytes(schemaBytes)
	if err != nil {
		fmt.Printf("opendci-wasm: failed to load schema: %v\n", err)
		return
	}

	validValues := reg.ValidValuesMap()

	// Register decode function: opendciDecode(Uint8Array) -> string (JSON/JSONC)
	js.Global().Set("opendciDecode", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		if len(args) < 1 {
			return errorResult("decode: expected 1 argument (Uint8Array)")
		}

		// Copy Uint8Array from JS to Go.
		jsArray := args[0]
		length := jsArray.Get("length").Int()
		data := make([]byte, length)
		js.CopyBytesToGo(data, jsArray)

		// Decode binary to config.
		result, err := codec.Decode(data, reg)
		if err != nil {
			return errorResult(fmt.Sprintf("decode error: %v", err))
		}

		// Collect JSONC comment lines for non-schema-conforming items.
		var comments []string

		// MIC verification comments.
		if result.CmMic != nil {
			micResult := codec.VerifyCmMic(data, result.CmMic)
			if micResult.Valid {
				comments = append(comments, "// CM MIC: VALID")
			} else {
				comments = append(comments, fmt.Sprintf("// CM MIC: INVALID (expected %X, computed %X)",
					micResult.Expected, micResult.Computed))
			}
			comments = append(comments, fmt.Sprintf("// \"CmMic\": \"%X\",", result.CmMic))
		}

		if result.CmtsMic != nil {
			comments = append(comments, fmt.Sprintf("// \"CmtsMic\": \"%X\",", result.CmtsMic))
			comments = append(comments, "// CMTS MIC: SKIPPED (no shared secret in browser)")
		}

		// Extract UnknownTlvs from config before marshaling — they become JSONC comments.
		if unknowns, ok := result.Config["UnknownTlvs"]; ok {
			delete(result.Config, "UnknownTlvs")

			utJSON, err := json.MarshalIndent(unknowns, "", "  ")
			if err == nil {
				lines := strings.Split(string(utJSON), "\n")
				comments = append(comments, fmt.Sprintf("// \"UnknownTlvs\": %s", lines[0]))
				for _, line := range lines[1:] {
					comments = append(comments, "// "+line)
				}
			}
		}

		// Remove CmMic and CmtsMic from config — emitted only as comments.
		delete(result.Config, "CmMic")
		delete(result.Config, "CmtsMic")

		// Strip internal ordering metadata before JSON output.
		codec.StripTLVOrder(result.Config)

		// Format as JSONC (without MIB resolver — nil).
		jsoncData, err := codec.FormatJSONC(result.Config, comments, validValues)
		if err != nil {
			return errorResult(fmt.Sprintf("JSONC formatting error: %v", err))
		}

		return successResult(jsoncData)
	}))

	// Register encode function: opendciEncode(string) -> {ok: bool, data?: Uint8Array, error?: string}
	js.Global().Set("opendciEncode", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		if len(args) < 1 {
			return errorResult("encode: expected 1 argument (JSON string)")
		}

		jsonStr := args[0].String()

		// Strip JSONC comments to produce valid JSON.
		cleanJSON := codec.StripJSONCComments(jsonStr)

		// Parse JSON into config map.
		var config map[string]interface{}
		if err := json.Unmarshal([]byte(cleanJSON), &config); err != nil {
			return errorResult(fmt.Sprintf("JSON parse error: %v", err))
		}

		// Build a DecodeResult for the encoder.
		result := &codec.DecodeResult{
			Config: config,
		}

		// Encode to binary.
		encoded, err := codec.Encode(result, reg)
		if err != nil {
			return errorResult(fmt.Sprintf("encode error: %v", err))
		}

		// Return Uint8Array to JS.
		jsArray := js.Global().Get("Uint8Array").New(len(encoded))
		js.CopyBytesToJS(jsArray, encoded)

		return map[string]interface{}{
			"ok":   true,
			"data": jsArray,
		}
	}))

	fmt.Println("opendci-wasm: ready")

	// Keep Go runtime alive.
	<-make(chan struct{})
}

// errorResult returns a JS-compatible error result object.
func errorResult(msg string) map[string]interface{} {
	return map[string]interface{}{
		"ok":    false,
		"error": msg,
	}
}

// successResult returns a JS-compatible success result object with a string value.
func successResult(data string) map[string]interface{} {
	return map[string]interface{}{
		"ok":   true,
		"data": data,
	}
}
