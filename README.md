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
- Shareable config links via URL — share configs, link to lines or TLV paths

## Sharing Configs

Configs can be shared via URL. Click the **Get Link** button in the toolbar to copy a shareable link to your clipboard.

### Inline config

The editor content is compressed and embedded directly in the URL hash:

```
https://roc-ops.github.io/open-dci-web/#config=eJwLzy...
```

Most DOCSIS configs compress well and fit within browser URL limits. A warning is shown if the URL exceeds ~8,000 characters.

### Link to a repo file

Load a config from the [open-dci](https://github.com/roc-ops/open-dci) repository:

```
https://roc-ops.github.io/open-dci-web/#file=docs/examples/basic-cm.jsonc
```

### Link to a GitHub Gist

Load from a public GitHub Gist by ID:

```
https://roc-ops.github.io/open-dci-web/#gist=abc123def456
```

### Link to any raw URL

Load from an arbitrary URL (subject to CORS):

```
https://roc-ops.github.io/open-dci-web/#url=https://example.com/my-config.jsonc
```

### Deep linking

Combine any of the above with line or TLV navigation parameters:

| Parameter | Example | Description |
|-----------|---------|-------------|
| `&line=N` | `&line=15` | Scroll to and highlight line N |
| `&highlight=M-N` | `&highlight=12-18` | Highlight lines M through N |
| `&tlv=Path` | `&tlv=DownstreamServiceFlow.0.MaxSustainedTrafficRate` | Navigate to a TLV by JSON path |

Example with deep link:

```
https://roc-ops.github.io/open-dci-web/#file=docs/examples/basic-cm.jsonc&tlv=MaxNumCpes
```

### Limitations

- **URL length**: Inline configs (`#config=`) are limited by browser URL length. Very large configs should use a Gist or file link instead.
- **CORS**: Arbitrary URLs (`#url=`) may be blocked by CORS. GitHub raw URLs and Gist API work from the browser.
- **Public only**: Gist and file loading only works with public resources (no authentication).

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
