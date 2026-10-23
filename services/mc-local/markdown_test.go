package main

import (
	"strings"
	"testing"
)

func problemPaths(ps []Problem) []string {
	out := make([]string, 0, len(ps))
	for _, p := range ps {
		out = append(out, p.Path)
	}
	return out
}

func hasProblem(ps []Problem, path string) bool {
	for _, p := range ps {
		if p.Path == path {
			return true
		}
	}
	return false
}

func TestNoFrontmatterMeansNoProblems(t *testing.T) {
	p := parseMarkdown("# Plan\n\n- [ ] write it\n- [x] test it\n")
	if len(p.Problems) != 0 {
		t.Fatalf("plain markdown should have no problems, got %v", p.Problems)
	}
	if p.Title != "Plan" || len(p.Headings) != 1 {
		t.Fatalf("title %q headings %v", p.Title, p.Headings)
	}
	if len(p.Tasks) != 2 || p.Tasks[0].Done || !p.Tasks[1].Done {
		t.Fatalf("tasks %v", p.Tasks)
	}
}

func TestFrontmatterStatusAndTitle(t *testing.T) {
	p := parseMarkdown("---\ntitle: Launch\nstatus: review\ntags: [a, b]\n---\n# Heading\n")
	if p.Title != "Launch" || p.Status != "review" {
		t.Fatalf("title %q status %q", p.Title, p.Status)
	}
	if len(p.Problems) != 0 {
		t.Fatalf("valid frontmatter should have no problems: %v", p.Problems)
	}
}

func TestCodeFencesHideHeadingsAndTasks(t *testing.T) {
	p := parseMarkdown("```\n# not a heading\n- [ ] not a task\n```\n## Real\n")
	if len(p.Headings) != 1 || p.Headings[0].Text != "Real" || len(p.Tasks) != 0 {
		t.Fatalf("headings %v tasks %v", p.Headings, p.Tasks)
	}
}

func TestBrokenYAMLIsAProblem(t *testing.T) {
	p := parseMarkdown("---\ntitle: [unclosed\n---\nbody\n")
	if !hasProblem(p.Problems, "frontmatter") {
		t.Fatalf("want a frontmatter problem, got %v", p.Problems)
	}
}

func TestPublishedNeedsTitleAndDate(t *testing.T) {
	p := parseMarkdown("---\nstatus: published\n---\n")
	if !hasProblem(p.Problems, "frontmatter") {
		t.Fatalf("published without title/published_at should fail, got %v", problemPaths(p.Problems))
	}
	ok := parseMarkdown("---\ntitle: Done\nstatus: published\npublished_at: 2026-10-23T09:00:00Z\n---\n")
	if len(ok.Problems) != 0 {
		t.Fatalf("complete published document should pass: %v", ok.Problems)
	}
}

func TestBadDateIsAProblem(t *testing.T) {
	p := parseMarkdown("---\ndue: 2026-13-40\n---\n")
	if !hasProblem(p.Problems, "due") {
		t.Fatalf("want a due problem, got %v", p.Problems)
	}
}

func TestEndBeforeStartIsCaughtByTheGuard(t *testing.T) {
	p := parseMarkdown("---\nstart: 2026-10-20\nend: 2026-10-01\n---\n")
	if !hasProblem(p.Problems, "end") {
		t.Fatalf("want an end problem, got %v", p.Problems)
	}
}

func TestPriorityRange(t *testing.T) {
	p := parseMarkdown("---\npriority: 9\n---\n")
	if !hasProblem(p.Problems, "priority") {
		t.Fatalf("want a priority problem, got %v", p.Problems)
	}
	if strings.Contains(strings.Join(problemPaths(p.Problems), ","), "title") {
		t.Fatalf("unrelated problem reported: %v", p.Problems)
	}
}
