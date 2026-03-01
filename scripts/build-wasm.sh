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
const dirs = ['ietf', 'iana', 'cablelabs/DOCSIS', 'cablelabs/OpenCable', 'cablelabs/PacketCable', 'cablelabs/common', 'cablelabs/wireless'];
const bundle = {};

// Patches for MIB files with gosmi parser incompatibilities.
// These fix syntax issues that prevent the Go SMI parser from loading certain modules.
// Patches for MIB files with gosmi parser incompatibilities.
// These fix syntax issues that prevent the Go SMI parser from loading certain modules.
const patches = {
  'PKTC-MTA-MIB.mib': (s) =>
    // DEFVAL { {   } }} — nested braces for empty BITS value; gosmi cannot parse this.
    // Remove the entire DEFVAL clause (absent DEFVAL is valid SMIv2).
    s.replace(/^\s*DEFVAL\s*\{\s*\{[^}]*\}\s*\}\}\s*$/gm, ''),
  'PKTC-EN-MTA-MIB.mib': (s) =>
    // LAST-UPDATED has an inline comment after the Z: '200501280000Z – January 28, 2005'
    s.replace(/\"(\d{12,14}Z)\s*\u2013[^\"]+\"/g, (m, ts) => '\"' + ts + '\"'),
  'PKTC-EVENT-MIB.mib': (s) =>
    // PDF page break headers embedded in MIB source (artifact of extraction from PDF spec)
    s.replace(/^Management Event MIB Specification\s+PKT-SP-EVEMIB.*$/gm, ''),
  'PKTC-EN-SIG-MIB.mib': (s) =>
    // Missing closing quote on DESCRIPTION string for the first REVISION
    s.replace('and published as part of PKT-SP-MIB-EXSIG1.5-I05-121030\n',
              'and published as part of PKT-SP-MIB-EXSIG1.5-I05-121030\"\n'),
};

for (const dir of dirs) {
  const fullDir = path.join(mibsRoot, dir);
  if (!fs.existsSync(fullDir)) continue;
  for (const file of fs.readdirSync(fullDir)) {
    if (!file.endsWith('.mib')) continue;
    const filePath = path.join(fullDir, file);
    const stat = fs.lstatSync(filePath);
    if (!stat.isSymbolicLink()) continue; // only latest versions (symlinks)
    let content = fs.readFileSync(filePath, 'utf8');
    if (patches[file]) {
      content = patches[file](content);
    }
    bundle[file] = content;
  }
}

fs.writeFileSync(
  path.join('$PROJECT_ROOT', 'public/mibs.json'),
  JSON.stringify(bundle)
);
console.log('Bundled ' + Object.keys(bundle).length + ' MIB files into public/mibs.json (' + Math.round(fs.statSync(path.join('$PROJECT_ROOT', 'public/mibs.json')).size / 1024) + ' KB)');
"

# Bundle vendor-specific schemas into a single JSON file for browser loading.
node -e "
const fs = require('fs');
const path = require('path');

const vendorDir = path.join('$PROJECT_ROOT', 'vendor/open-dci/schemas/vendors');
const bundle = {};

if (fs.existsSync(vendorDir)) {
  for (const file of fs.readdirSync(vendorDir)) {
    if (!file.endsWith('.jtd.json')) continue;
    const filePath = path.join(vendorDir, file);
    bundle[file] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
}

fs.writeFileSync(
  path.join('$PROJECT_ROOT', 'public/vendor-schemas.json'),
  JSON.stringify(bundle)
);
console.log('Bundled ' + Object.keys(bundle).length + ' vendor schemas into public/vendor-schemas.json');
"
