#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REF_IMPL="$PROJECT_ROOT/vendor/open-dci/reference-implementation"

cd "$REF_IMPL"
GOOS=js GOARCH=wasm go build -o "$PROJECT_ROOT/public/opendci.wasm" .
cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" "$PROJECT_ROOT/public/wasm_exec.js"
cp "$PROJECT_ROOT/schemas/docsis-config.jtd.json" "$PROJECT_ROOT/public/docsis-config.jtd.json"
echo "Built opendci.wasm ($(wc -c < "$PROJECT_ROOT/public/opendci.wasm" | tr -d ' ') bytes)"
