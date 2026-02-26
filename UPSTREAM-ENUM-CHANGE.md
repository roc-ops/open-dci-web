# Upstream Change Request: Add Enum Values to MIBTreeNode

## Summary

The `opendciQueryMIBTree()` WASM export currently returns tree nodes with a `syntax` field (e.g., "INTEGER", "TruthValue") but does not include the named enum values defined in the MIB SYNTAX clause. This change adds an optional `enums` array to `MIBTreeNode` so consumers can display enum dropdowns instead of freeform text inputs.

## Motivation

The open-dci-web MIB browser lets users select SNMP MIB objects and enter values. For MIB objects with named integer enums (e.g., `ifAdminStatus`: up/down/testing), the browser should show a dropdown with `1 (up)`, `2 (down)`, `3 (testing)` instead of a freeform text field. This requires the full enum value list to be available in the tree query response.

The existing `ResolveEnum(oid, value)` function resolves a single value at a time, which doesn't support populating a dropdown with all options.

## Change Details

**File:** `reference-implementation/mibresolver/tree.go`

### 1. New type: `EnumValue`

```go
// EnumValue represents a named integer value in a MIB object's SYNTAX clause.
type EnumValue struct {
    Value int64  `json:"value"`
    Label string `json:"label"`
}
```

### 2. New field on `MIBTreeNode`

```go
type MIBTreeNode struct {
    // ... existing fields ...
    Enums    []EnumValue    `json:"enums,omitempty"`
    Children []*MIBTreeNode `json:"children,omitempty"`
}
```

### 3. Population in `smiNodeToTreeNode()`

After the existing syntax population block, add:

```go
if sn.Type.Enum != nil && len(sn.Type.Enum.Values) > 0 {
    enums := make([]EnumValue, 0, len(sn.Type.Enum.Values))
    for _, v := range sn.Type.Enum.Values {
        enums = append(enums, EnumValue{Value: v.Value, Label: v.Name})
    }
    sort.Slice(enums, func(i, j int) bool {
        return enums[i].Value < enums[j].Value
    })
    tn.Enums = enums
}
```

## JSON Output Example

Before:
```json
{
  "oid": "1.3.6.1.2.1.2.2.1.7",
  "name": "ifAdminStatus",
  "module": "IF-MIB",
  "syntax": "INTEGER",
  "access": "read-write",
  "nodeType": "column"
}
```

After:
```json
{
  "oid": "1.3.6.1.2.1.2.2.1.7",
  "name": "ifAdminStatus",
  "module": "IF-MIB",
  "syntax": "INTEGER",
  "access": "read-write",
  "nodeType": "column",
  "enums": [
    {"value": 1, "label": "up"},
    {"value": 2, "label": "down"},
    {"value": 3, "label": "testing"}
  ]
}
```

The `enums` field is omitted entirely for nodes without enum values (no behavior change for non-enum nodes).

## Patch

The full git patch is available at:
```
cd vendor/open-dci && git format-patch -1 HEAD --stdout
```

Or apply directly:
```
cd vendor/open-dci && git diff HEAD~1 -- reference-implementation/mibresolver/tree.go
```

## Backward Compatibility

- The `enums` field uses `omitempty` — nodes without enums produce identical JSON output
- No existing fields are modified
- No API signature changes
- The `ResolveEnum()` function is unaffected
