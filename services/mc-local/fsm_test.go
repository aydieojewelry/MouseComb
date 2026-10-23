package main

import (
	"strings"
	"testing"
)

func TestCheckTransition(t *testing.T) {
	cases := []struct {
		name     string
		from, to string
		ok       bool
	}{
		{"first status is free", "", "draft", true},
		{"no change", "published", "published", true},
		{"draft to review", "draft", "review", true},
		{"draft cannot skip review", "draft", "published", false},
		{"review to published", "review", "published", true},
		{"published back to draft", "published", "draft", true},
		{"archived is final", "archived", "draft", false},
		{"status cannot be removed", "draft", "", false},
		{"unknown status is refused", "draft", "nope", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := checkTransition(c.from, c.to)
			if (err == nil) != c.ok {
				t.Fatalf("checkTransition(%q, %q) = %v, want ok=%v", c.from, c.to, err, c.ok)
			}
			if err != nil {
				se, ok := statusOf(err)
				if !ok || se.Status != 422 {
					t.Fatalf("want a 422 status error, got %v", err)
				}
			}
		})
	}
}

func TestIllegalMoveSaysWhereItCanGo(t *testing.T) {
	err := checkTransition("draft", "published")
	if err == nil || !strings.Contains(err.Error(), "review") {
		t.Fatalf("message should name the allowed next status, got %v", err)
	}
}

func TestParseRulesRejectsBrokenFiles(t *testing.T) {
	bad := map[string]string{
		"no statuses":  `{"statuses": [], "transitions": {}}`,
		"unknown from": `{"statuses": ["a"], "transitions": {"b": ["a"]}}`,
		"unknown to":   `{"statuses": ["a"], "transitions": {"a": ["c"]}}`,
	}
	for name, raw := range bad {
		if _, err := parseRules([]byte(raw)); err == nil {
			t.Errorf("%s: want an error", name)
		}
	}
}
