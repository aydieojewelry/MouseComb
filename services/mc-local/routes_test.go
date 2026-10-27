package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

const (
	testToken = "0123456789abcdef0123456789abcdef"
	testWS    = "wsdemo000000001"
	planBody  = "---\nstatus: draft\n---\n# Plan\n"
)

func planHashOf() string { return hashOf([]byte(planBody)) }

func body(v any) *strings.Reader {
	raw, _ := json.Marshal(v)
	return strings.NewReader(string(raw))
}

// setupWorkspace creates a workspace with a fixed id and two files on disk.
func setupWorkspace(t testing.TB, app *tests.TestApp) {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "plan.md"), []byte(planBody), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "data.csv"), []byte("a,b\n1,2\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	col, err := app.FindCollectionByNameOrId("workspaces")
	if err != nil {
		t.Fatal(err)
	}
	rec := core.NewRecord(col)
	rec.Id = testWS
	rec.Set("name", "Demo")
	rec.Set("root", dir)
	if err := app.Save(rec); err != nil {
		t.Fatal(err)
	}
}

func scenario(name, method, url string, payload any, status int, headers map[string]string, want ...string) *tests.ApiScenario {
	var reader *strings.Reader
	if payload != nil {
		reader = body(payload)
	} else {
		reader = strings.NewReader("")
	}
	return &tests.ApiScenario{
		Name:            name,
		Method:          method,
		URL:             url,
		Body:            reader,
		Headers:         headers,
		ExpectedStatus:  status,
		ExpectedContent: want,
		TestAppFactory: func(t testing.TB) *tests.TestApp {
			app, err := tests.NewTestApp()
			if err != nil {
				t.Fatal(err)
			}
			return app
		},
		BeforeTestFunc: func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
			setupWorkspace(t, app)
			g := &guard{}
			g.setToken(testToken)
			registerRoutes(app, e, g)
		},
	}
}

const (
	local = "http://127.0.0.1:8090"
)

func authed(extra ...string) map[string]string {
	h := map[string]string{"X-MC-Token": testToken, "Content-Type": "application/json"}
	for i := 0; i+1 < len(extra); i += 2 {
		h[extra[i]] = extra[i+1]
	}
	return h
}

func TestRoutes(t *testing.T) {
	list := local + "/api/mc/tree?workspace=" + testWS
	file := local + "/api/mc/file?workspace=" + testWS + "&path=plan.md"
	put := local + "/api/mc/file"

	scenarios := []*tests.ApiScenario{
		scenario("health needs no token", "GET", local+"/api/mc/health", nil, 200, nil, `"ok":true`),
		scenario("tree without a token is refused", "GET", list, nil, 401, map[string]string{}, `"status":401`),
		scenario("tree with a wrong token is refused", "GET", list, nil, 401, map[string]string{"X-MC-Token": "nope"}, `"status":401`),
		scenario("a page from another origin is refused", "GET", list, nil, 403, authed("Origin", "https://evil.example"), `"status":403`),
		scenario("a foreign Host is refused", "GET", "http://evil.example/api/mc/health", nil, 403, nil, `"status":403`),
		scenario("tree lists the workspace", "GET", list, nil, 200, authed("Origin", "tauri://localhost"), `"plan.md"`, `"data.csv"`),
		scenario("file read returns its hash", "GET", file, nil, 200, authed(), `"hash"`),
		scenario("save with the right hash works", "PUT", put, map[string]any{
			"workspace": testWS, "path": "plan.md", "content": "---\nstatus: review\n---\n# Plan\n", "expected_hash": planHashOf(),
		}, 200, authed(), `"hash"`),
		scenario("save with a stale hash is a conflict", "PUT", put, map[string]any{
			"workspace": testWS, "path": "plan.md", "content": "no frontmatter here", "expected_hash": "stale",
		}, 409, authed(), "changed on disk"),
		scenario("draft cannot jump to published", "PUT", put, map[string]any{
			"workspace": testWS, "path": "plan.md", "expected_hash": planHashOf(),
			"content": "---\nstatus: published\ntitle: X\npublished_at: 2026-10-23T09:00:00Z\n---\n",
		}, 422, authed(), "can become: review"),
		scenario("broken frontmatter is refused before anything is written", "PUT", put, map[string]any{
			"workspace": testWS, "path": "plan.md", "expected_hash": planHashOf(), "content": "---\ntitle: [oops\n---\n",
		}, 422, authed(), "Not valid YAML"),
		scenario("a path that climbs out is refused", "PUT", put, map[string]any{
			"workspace": testWS, "path": "../escape.md", "expected_hash": "", "content": "x",
		}, 403, authed(), "isn't allowed"),
		scenario("creating over an existing file is a conflict", "POST", local+"/api/mc/fs/create", map[string]any{
			"workspace": testWS, "path": "plan.md", "content": "x",
		}, 409, authed(), "already exists"),
		scenario("a Windows-reserved name is refused", "POST", local+"/api/mc/fs/create", map[string]any{
			"workspace": testWS, "path": "CON.md", "content": "x",
		}, 400, authed(), "reserves"),
	}
	for _, s := range scenarios {
		s.Test(t)
	}
}

// The database guard: a record can't take a forbidden status jump, whichever
// code path saves it.
func TestRecordStatusGuard(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	app.OnRecordUpdate("artifacts").BindFunc(checkRecordStatus)

	setupWorkspace(t, app)
	col, err := app.FindCollectionByNameOrId("artifacts")
	if err != nil {
		t.Fatal(err)
	}
	rec := core.NewRecord(col)
	rec.Set("workspace", testWS)
	rec.Set("rel_path", "plan.md")
	rec.Set("status", "draft")
	if err := app.Save(rec); err != nil {
		t.Fatal(err)
	}

	// Load a fresh copy, as the service always does: the guard compares with
	// the status the database holds.
	fresh, err := app.FindRecordById("artifacts", rec.Id)
	if err != nil {
		t.Fatal(err)
	}
	fresh.Set("status", "published")
	if err := app.Save(fresh); err == nil {
		t.Fatal("draft to published must be refused at the record")
	}
	again, err := app.FindRecordById("artifacts", rec.Id)
	if err != nil {
		t.Fatal(err)
	}
	again.Set("status", "review")
	if err := app.Save(again); err != nil {
		t.Fatalf("draft to review is allowed: %v", err)
	}
}
