# Upstream Change Request: Add INDEX Clause Data to MIBTreeNode

## Summary

The `opendciQueryMIBTree()` WASM export currently returns tree nodes without INDEX clause information. This change adds an `indexes` array to `MIBTreeNode` for table row nodes, so consumers can display named index fields with type information instead of a generic freeform input.

## Motivation

The open-dci-web MIB browser lets users select SNMP table columns and enter index values. Currently, the browser shows a single generic "Instance Index" text input with no context about what the index should be. Users have no way to know:

- The name of the index (e.g., "ifIndex")
- How many indexes a table requires (some have composite keys)
- The type/syntax of each index (INTEGER, DisplayString, etc.)
- Any description from the MIB about the index

With index metadata exposed, the browser can show named, typed index fields with tooltips — significantly improving usability for complex tables.

## Change Details

**File:** `reference-implementation/mibresolver/tree.go`

### 1. New type: `IndexObject`

```go
// IndexObject represents an index column from a SNMP table's INDEX clause.
type IndexObject struct {
    Name        string `json:"name"`
    OID         string `json:"oid"`
    Module      string `json:"module"`
    Syntax      string `json:"syntax,omitempty"`
    Description string `json:"description,omitempty"`
}
```

### 2. New field on `MIBTreeNode`

```go
type MIBTreeNode struct {
    // ... existing fields ...
    Indexes  []IndexObject  `json:"indexes,omitempty"`
    Enums    []EnumValue    `json:"enums,omitempty"`
    Children []*MIBTreeNode `json:"children,omitempty"`
}
```

### 3. Population in `smiNodeToTreeNode()`

After the existing enum population block, add index extraction for table row nodes:

```go
// Populate indexes for table row (entry) nodes.
// gosmi's GetIndex() returns the INDEX clause objects for the row.
if sn.Kind == types.NodeKindRow {
    indexNodes := sn.GetIndex()
    if len(indexNodes) > 0 {
        indexes := make([]IndexObject, 0, len(indexNodes))
        for _, idx := range indexNodes {
            io := IndexObject{
                Name:   idx.Name,
                OID:    idx.RenderNumeric(),
                Module: idx.GetModule().Name,
            }
            if idx.Type != nil {
                io.Syntax = idx.Type.Name
            }
            if idx.Description != "" {
                io.Description = idx.Description
            }
            indexes = append(indexes, io)
        }
        tn.Indexes = indexes
    }
}
```

**Note:** The `GetIndex()` method is available on gosmi `SmiNode` (v0.4.4). It returns `[]SmiNode` representing the objects listed in the table's INDEX clause.

## JSON Output Example

Before (ifEntry — table row for the interfaces table):
```json
{
  "oid": "1.3.6.1.2.1.2.2.1",
  "name": "ifEntry",
  "module": "IF-MIB",
  "description": "An entry containing management information...",
  "nodeType": "row",
  "children": [...]
}
```

After:
```json
{
  "oid": "1.3.6.1.2.1.2.2.1",
  "name": "ifEntry",
  "module": "IF-MIB",
  "description": "An entry containing management information...",
  "nodeType": "row",
  "indexes": [
    {
      "name": "ifIndex",
      "oid": "1.3.6.1.2.1.2.2.1.1",
      "module": "IF-MIB",
      "syntax": "InterfaceIndex",
      "description": "A unique value, greater than zero, for each interface..."
    }
  ],
  "children": [...]
}
```

Multi-index example (tcpConnEntry — 4 indexes):
```json
{
  "oid": "1.3.6.1.2.1.6.13.1",
  "name": "tcpConnEntry",
  "module": "TCP-MIB",
  "nodeType": "row",
  "indexes": [
    {"name": "tcpConnLocalAddress", "oid": "...", "module": "TCP-MIB", "syntax": "IpAddress"},
    {"name": "tcpConnLocalPort", "oid": "...", "module": "TCP-MIB", "syntax": "INTEGER"},
    {"name": "tcpConnRemAddress", "oid": "...", "module": "TCP-MIB", "syntax": "IpAddress"},
    {"name": "tcpConnRemPort", "oid": "...", "module": "TCP-MIB", "syntax": "INTEGER"}
  ],
  "children": [...]
}
```

The `indexes` field is omitted entirely for non-row nodes (no behavior change).

## Backward Compatibility

- The `indexes` field uses `omitempty` — non-row nodes produce identical JSON output
- No existing fields are modified
- No API signature changes
- The `EnumValue` and `Enums` fields added in the previous change are unaffected
