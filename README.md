# OpenDCI Web Editor

A browser-based editor for DOCSIS configuration files, powered by the [OpenDCI](https://github.com/roc-ops/open-dci) schema and reference implementation.

**Live editor: https://roc-ops.github.io/open-dci-web/**

## Features

- Monaco-based JSON editor with DOCSIS schema validation and auto-complete
- Inline comments for valid values (e.g. `// enabled(1)`)
- Hover documentation from `x-docsis-*` schema metadata
- Binary DOCSIS config encode/decode via WASM (Go reference implementation)
- MIB-aware OID resolution for SNMP objects
- No server required — runs entirely in the browser

## Development

```bash
pnpm install
pnpm dev
```

### Rebuilding the WASM codec

Requires Go 1.21+:

```bash
pnpm build:wasm
```

### Production build

```bash
pnpm build
```

## License

See [OpenDCI](https://github.com/roc-ops/open-dci) for schema and codec licensing.
