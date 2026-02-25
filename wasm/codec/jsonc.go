package codec

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// propertyLineRe matches JSON property lines with integer values, e.g.:
//
//	"NetworkAccess": 1,
var propertyLineRe = regexp.MustCompile(`^(\s*)"([^"]+)":\s*(\d+)(,?)$`)

// FormatJSONC marshals config as pretty-printed JSON, then appends the given
// comment lines (each prefixed with "// ") just before the closing "}".
// If comments is empty and validValues is nil the output is plain JSON.
// When validValues is provided, matching integer property values get an
// inline "// label" comment appended to the line.
//
// Note: MIB resolver is not available in the WASM build. SNMP OID comments
// are omitted. This will be addressed in a future version.
func FormatJSONC(config map[string]interface{}, comments []string, validValues map[string]map[string]string) (string, error) {
	jsonData, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return "", fmt.Errorf("encoding JSON: %w", err)
	}

	s := string(jsonData)
	s = addInlineComments(s, validValues)
	// MIB resolver not available in WASM — skip addSnmpComments.

	if len(comments) == 0 {
		return s, nil
	}

	// Find the last '}' which closes the top-level object.
	lastBrace := strings.LastIndex(s, "}")
	if lastBrace < 0 {
		return "", fmt.Errorf("unexpected JSON structure: no closing brace")
	}

	// Everything before the closing brace (includes the trailing newline after
	// the last property, if any).
	before := s[:lastBrace]

	// Ensure there is a newline before the comment block. For an empty object
	// json.MarshalIndent produces "{}" with no newline between the braces.
	if !strings.HasSuffix(before, "\n") {
		before += "\n"
	}

	// Build the comment block. Each line is indented with two spaces.
	var commentBlock strings.Builder
	for _, c := range comments {
		commentBlock.WriteString("  " + c + "\n")
	}

	return before + commentBlock.String() + "}", nil
}

// addInlineComments appends "// label" comments to JSON property lines whose
// integer value has a matching entry in validValues.
func addInlineComments(jsonStr string, validValues map[string]map[string]string) string {
	if len(validValues) == 0 {
		return jsonStr
	}
	lines := strings.Split(jsonStr, "\n")
	for i, line := range lines {
		m := propertyLineRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		propName := m[2]
		valueStr := m[3]
		vvMap, ok := validValues[propName]
		if !ok {
			continue
		}
		label, ok := vvMap[valueStr]
		if !ok {
			continue
		}
		lines[i] = line + " // " + label
	}
	return strings.Join(lines, "\n")
}

// StripJSONCComments removes single-line // comments from JSONC text, producing
// valid JSON. It handles comments at the end of lines (inline comments) and
// full-line comments. It is careful not to strip // inside quoted strings.
func StripJSONCComments(input string) string {
	lines := strings.Split(input, "\n")
	var result []string

	for _, line := range lines {
		stripped := stripLineComment(line)
		// Skip lines that are entirely comments (now empty or whitespace-only).
		trimmed := strings.TrimSpace(stripped)
		if trimmed == "" {
			continue
		}
		result = append(result, stripped)
	}

	return strings.Join(result, "\n")
}

// stripLineComment removes the // comment portion from a single line,
// respecting quoted strings. Returns the line with the comment removed.
func stripLineComment(line string) string {
	inString := false
	escape := false

	for i, ch := range line {
		if escape {
			escape = false
			continue
		}
		if ch == '\\' && inString {
			escape = true
			continue
		}
		if ch == '"' {
			inString = !inString
			continue
		}
		if !inString && ch == '/' && i+1 < len(line) && line[i+1] == '/' {
			return strings.TrimRight(line[:i], " \t")
		}
	}

	return line
}
