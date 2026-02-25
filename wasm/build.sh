#!/bin/bash
set -e
cd "$(dirname "$0")"

GO="${GO:-go}"

# Ensure the embedded schema is up to date.
mkdir -p schemas
cp ../schemas/docsis-config.jtd.json schemas/docsis-config.jtd.json

# Build WASM binary.
GOOS=js GOARCH=wasm "$GO" build -o ../public/opendci.wasm .

# Copy Go's WASM exec helper.
cp "$("$GO" env GOROOT)/lib/wasm/wasm_exec.js" ../public/wasm_exec.js

echo "Built opendci.wasm ($(wc -c < ../public/opendci.wasm | tr -d ' ') bytes) and wasm_exec.js in public/"
