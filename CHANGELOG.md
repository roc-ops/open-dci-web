# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-03-02

Initial release of the OpenDCI Web Editor -- a browser-based DOCSIS configuration
file editor powered by Monaco and the OpenDCI schema.

### Added

- **Editor** -- Monaco-based JSON editor with DOCSIS JTD schema validation and auto-complete
- **Editor** -- Inline comments for `x-docsis-validValues` fields (e.g. `// enabled(1)`)
- **Editor** -- Hover documentation from `x-docsis-*` schema metadata with TLV path display
- **Editor** -- Auto-triggered completion popup on comma, Enter, and brace keystrokes
- **Editor** -- Diagnostic warnings for invalid `validValues` and out-of-range `x-docsis-range` values
- **Editor** -- Cross-field validation diagnostics (e.g. matching ServiceFlowRef/ClassifierId)
- **Editor** -- Quick-fix CodeActionProvider for diagnostics
- **Editor** -- DocumentSymbolProvider for breadcrumbs and outline navigation
- **Editor** -- Find TLV Property search command
- **Editor** -- Copy TLV Path and Get Link for TLV in right-click context menu
- **Editor** -- Format button in toolbar
- **Editor** -- Collapsible problems panel below editor
- **Editor** -- Drag-and-drop file support
- **Editor** -- Unsaved changes warning with dirty indicator
- **Editor** -- Keyboard shortcuts for toolbar actions
- **Editor** -- CM and MTA (PacketCable) schema switching with toolbar toggle
- **Editor** -- Example configs dropdown with realistic CM and MTA configurations
- **Codec** -- Binary DOCSIS config encode and decode via WASM (OpenDCI Go reference implementation)
- **Codec** -- Loading modal with progress messages during WASM/MIB initialization
- **Codec** -- Encode/decode buttons disabled during WASM loading to prevent errors
- **Codec** -- PacketCable config detection with hash variant selector and computed hash insertion
- **Codec** -- CMTS shared-secret input for MIC validation with show/hide toggle
- **Codec** -- Hex input with auto-chunking CodeLens for chunked TLVs
- **MIB Browser** -- Full MIB browser modal with tree view, details panel, and search
- **MIB Browser** -- MIB manager modal for loading and unloading MIB files
- **MIB Browser** -- Last-updated date display in MIBs modal
- **MIB Browser** -- SNMPMibObject integration via CodeLens (add OID from browser into config)
- **MIB Browser** -- MIB enum dropdown for value input
- **MIB Browser** -- Table/row details and named index fields with info tooltips in tree view
- **MIB Browser** -- Keyboard navigation for MIB browser tree
- **MIB Browser** -- Pre-built MIB snapshot for fast page load
- **MIB Browser** -- PacketCable MIB support (PKTC-IETF-MTA-MIB, PKTC-SIG-MIB, etc.)
- **CVC** -- CVC extraction UI from signed firmware files
- **CVC** -- CVC certificate details CodeLens and modal
- **CVC** -- Extract from Firmware CodeLens on SwUpgradeFilename fields
- **CVC** -- Insert extracted CVC chain properties adjacent to their CVC field
- **Vendor TLV** -- Vendor-specific TLV 43 schema support with typed sub-TLVs
- **Vendor TLV** -- Vendor Schema Manager for uploading custom vendor JTD schemas
- **Sharing** -- URL hash-based config sharing (compressed inline config, repo file, Gist, raw URL)
- **Sharing** -- Get Link toolbar button for copying shareable URLs
- **Sharing** -- Deep linking to lines (`&line=`), line ranges (`&highlight=`), and TLV paths (`&tlv=`)
- **Sharing** -- Custom MIB loading via URL hash parameters (`&mibs=`, `&mibs-replace=`)
- **Sharing** -- Custom vendor schema loading via URL hash parameter (`&vendor=`)
- **Sharing** -- QR code modal for share links
- **Sharing** -- Diff view for comparing configs
- **UI** -- Dark/light theme toggle with persistence
- **UI** -- Settings panel for editor preferences
- **UI** -- Styled toast notifications (replacing browser alert dialogs)
- **UI** -- ARIA roles, labels, and focus management for accessibility
- **UI** -- Title text linking to GitHub project page
- **Deployment** -- GitHub Actions workflow for GitHub Pages deployment
- **Deployment** -- Service worker for offline support

### Fixed

- **Editor** -- Auto-complete now inserts correct default values by schema type
- **Editor** -- Missing trailing commas on autocomplete insertion
- **Editor** -- Stale comments cleared when value is not in validValues
- **Editor** -- False duplicate ServiceFlowReference diagnostics for classifiers
- **Editor** -- Stale offset bug in chunked-hex edit
- **Editor** -- Theme toggle and settings buttons not responding
- **Codec** -- WASM asset paths for GitHub Pages base path
- **Codec** -- PacketCable hash checkbox not updating config with computed hash
- **Codec** -- PacketCable hash not showing visible effect in editor
- **CVC** -- CVC chain certificate parsing failure on malformed chains
- **CVC** -- Single-cert CVC chains skipped in firmware extraction
- **Vendor TLV** -- Hover TLV paths for nested VendorSpecific properties
- **Vendor TLV** -- Multi-segment TLV path overlaps in metadata
- **MIB Browser** -- PacketCable MIB OID resolution with parser patches
- **MIB Browser** -- MTA example config comment formatting and wrong OID
- **UI** -- File picker type filters for Open vs Decode dialogs
- **UI** -- File picker cancel no longer triggers alert dialogs
- **UI** -- Example configs use correct schema property names
