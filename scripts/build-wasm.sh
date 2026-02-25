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

# Bundle latest MIBs into a single JSON file for browser loading.
node -e "
const fs = require('fs');
const path = require('path');

const mibsRoot = path.join('$PROJECT_ROOT', 'vendor/open-dci/mibs');
const dirs = ['ietf', 'iana', 'cablelabs/DOCSIS', 'cablelabs/OpenCable', 'cablelabs/common', 'cablelabs/wireless'];
const bundle = {};

for (const dir of dirs) {
  const fullDir = path.join(mibsRoot, dir);
  if (!fs.existsSync(fullDir)) continue;
  for (const file of fs.readdirSync(fullDir)) {
    if (!file.endsWith('.mib')) continue;
    const filePath = path.join(fullDir, file);
    const stat = fs.lstatSync(filePath);
    if (!stat.isSymbolicLink()) continue; // only latest versions (symlinks)
    bundle[file] = fs.readFileSync(filePath, 'utf8');
  }
}

fs.writeFileSync(
  path.join('$PROJECT_ROOT', 'public/mibs.json'),
  JSON.stringify(bundle)
);
console.log('Bundled ' + Object.keys(bundle).length + ' MIB files into public/mibs.json (' + Math.round(fs.statSync(path.join('$PROJECT_ROOT', 'public/mibs.json')).size / 1024) + ' KB)');
"
