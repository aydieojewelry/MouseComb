package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/santhosh-tekuri/jsonschema/v6"
	"gopkg.in/yaml.v3"

	_ "embed"
)

// The frontmatter rules: schema/universal_artifact_schema.json, plus one
// explicit guard the schema can't express (a date range, Workaround 3).
//
//go:embed schema/universal_artifact_schema.json
var frontmatterSchemaJSON []byte

var frontmatterSchema = mustCompileFrontmatterSchema(frontmatterSchemaJSON)

func mustCompileFrontmatterSchema(raw []byte) *jsonschema.Schema {
	doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(raw))
	if err != nil {
		panic("schema/universal_artifact_schema.json: " + err.Error())
	}
	c := jsonschema.NewCompiler()
	c.AssertFormat()
	const url = "https://mousecomb.local/schemas/artifact-frontmatter.json"
	if err := c.AddResource(url, doc); err != nil {
		panic("schema/universal_artifact_schema.json: " + err.Error())
	}
	sch, err := c.Compile(url)
	if err != nil {
		panic("schema/universal_artifact_schema.json: " + err.Error())
	}
	return sch
}

// Problem is one thing wrong with a file's frontmatter or status. Path is a
// frontmatter key, or "frontmatter" for the block as a whole.
type Problem struct {
	Path    string `json:"path"`
	Message string `json:"message"`
}

type Heading struct {
	Level int    `json:"level"`
	Text  string `json:"text"`
	Line  int    `json:"line"`
}

type Task struct {
	Line int    `json:"line"`
	Done bool   `json:"done"`
	Text string `json:"text"`
}

type Parsed struct {
	Frontmatter map[string]any `json:"frontmatter"`
	Title       string         `json:"title"`
	Status      string         `json:"status"`
	Headings    []Heading      `json:"headings"`
	Tasks       []Task         `json:"tasks"`
	Problems    []Problem      `json:"problems"`
}

var (
	headingPattern = regexp.MustCompile(`^(#{1,6})\s+(.*?)\s*#*\s*$`)
	taskPattern    = regexp.MustCompile(`^\s*[-*+]\s+\[( |x|X)\]\s+(.*)$`)
)

// parseMarkdown reads the frontmatter, headings and task lines of a Markdown
// file. Headings and tasks inside fenced code blocks are ignored.
func parseMarkdown(content string) Parsed {
	p := Parsed{Frontmatter: map[string]any{}, Headings: []Heading{}, Tasks: []Task{}, Problems: []Problem{}}
	lines := strings.Split(content, "\n")
	for i := range lines {
		lines[i] = strings.TrimSuffix(lines[i], "\r")
	}

	body := 0
	hasFrontmatter := false
	if len(lines) > 0 && lines[0] == "---" {
		for i := 1; i < len(lines); i++ {
			if lines[i] == "---" {
				p.Frontmatter, p.Problems = parseFrontmatter(strings.Join(lines[1:i], "\n"))
				body = i + 1
				hasFrontmatter = true
				break
			}
		}
	}
	if hasFrontmatter {
		p.Problems = append(p.Problems, validateFrontmatter(p.Frontmatter)...)
	}

	fence := ""
	for i := body; i < len(lines); i++ {
		line := lines[i]
		trimmed := strings.TrimLeft(line, " \t")
		if strings.HasPrefix(trimmed, "```") || strings.HasPrefix(trimmed, "~~~") {
			marker := trimmed[:3]
			switch {
			case fence == "":
				fence = marker
			case fence == marker:
				fence = ""
			}
			continue
		}
		if fence != "" {
			continue
		}
		if m := headingPattern.FindStringSubmatch(line); m != nil {
			p.Headings = append(p.Headings, Heading{Level: len(m[1]), Text: m[2], Line: i + 1})
			continue
		}
		if m := taskPattern.FindStringSubmatch(line); m != nil {
			p.Tasks = append(p.Tasks, Task{Line: i + 1, Done: m[1] != " ", Text: m[2]})
		}
	}

	if title, ok := p.Frontmatter["title"].(string); ok && title != "" {
		p.Title = title
	} else {
		for _, h := range p.Headings {
			if h.Level == 1 {
				p.Title = h.Text
				break
			}
		}
	}
	p.Status, _ = p.Frontmatter["status"].(string)
	return p
}

func parseFrontmatter(block string) (map[string]any, []Problem) {
	var raw any
	if err := yaml.Unmarshal([]byte(block), &raw); err != nil {
		return map[string]any{}, []Problem{{Path: "frontmatter", Message: "Not valid YAML: " + firstLine(err.Error())}}
	}
	if raw == nil {
		return map[string]any{}, nil
	}
	m, ok := normalizeYAML(raw).(map[string]any)
	if !ok {
		return map[string]any{}, []Problem{{Path: "frontmatter", Message: "The frontmatter must be key: value pairs."}}
	}
	return m, nil
}

// normalizeYAML turns YAML's own types into JSON-like ones, so the schema
// sees dates as "2026-10-23" strings and every map has string keys.
func normalizeYAML(v any) any {
	switch t := v.(type) {
	case time.Time:
		if t.Hour() == 0 && t.Minute() == 0 && t.Second() == 0 && t.Nanosecond() == 0 {
			return t.Format(time.DateOnly)
		}
		return t.Format(time.RFC3339)
	case map[string]any:
		out := make(map[string]any, len(t))
		for k, val := range t {
			out[k] = normalizeYAML(val)
		}
		return out
	case map[any]any:
		out := make(map[string]any, len(t))
		for k, val := range t {
			out[fmt.Sprint(k)] = normalizeYAML(val)
		}
		return out
	case []any:
		out := make([]any, len(t))
		for i, val := range t {
			out[i] = normalizeYAML(val)
		}
		return out
	default:
		return v
	}
}

func validateFrontmatter(fm map[string]any) []Problem {
	raw, err := json.Marshal(fm)
	if err != nil {
		return []Problem{{Path: "frontmatter", Message: "Can't read the frontmatter."}}
	}
	inst, err := jsonschema.UnmarshalJSON(bytes.NewReader(raw))
	if err != nil {
		return []Problem{{Path: "frontmatter", Message: "Can't read the frontmatter."}}
	}

	var problems []Problem
	if err := frontmatterSchema.Validate(inst); err != nil {
		var ve *jsonschema.ValidationError
		if errors.As(err, &ve) {
			problems = flattenOutput(ve.BasicOutput(), problems)
		} else {
			problems = append(problems, Problem{Path: "frontmatter", Message: err.Error()})
		}
	}

	// Explicit guard: the schema can't compare two fields.
	start, okStart := parseDate(fm["start"])
	end, okEnd := parseDate(fm["end"])
	if okStart && okEnd && end.Before(start) {
		problems = append(problems, Problem{Path: "end", Message: "end is before start."})
	}
	return problems
}

func parseDate(v any) (time.Time, bool) {
	s, ok := v.(string)
	if !ok {
		return time.Time{}, false
	}
	t, err := time.Parse(time.DateOnly, s)
	return t, err == nil
}

func flattenOutput(u *jsonschema.OutputUnit, out []Problem) []Problem {
	if u.Error != nil && len(u.Errors) == 0 {
		path := strings.TrimPrefix(u.InstanceLocation, "/")
		if path == "" {
			path = "frontmatter"
		}
		out = append(out, Problem{Path: path, Message: u.Error.String() + "."})
	}
	for _, child := range u.Errors {
		out = flattenOutput(&child, out)
	}
	return out
}

func firstLine(s string) string {
	line, _, _ := strings.Cut(s, "\n")
	return line
}
