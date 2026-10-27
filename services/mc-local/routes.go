package main

import (
	"log"
	"path/filepath"
	"time"
	"unicode/utf8"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const version = "1"

// registerRoutes adds the editor's API under /api/mc/. Every route is behind
// the guard in guard.go, which is installed first.
func registerRoutes(app core.App, se *core.ServeEvent, g *guard) {
	se.Router.Bind(g.middleware())

	se.Router.GET("/api/mc/health", health)
	se.Router.GET("/api/mc/workspaces", listWorkspaces(app))
	se.Router.POST("/api/mc/workspaces", addWorkspace(app))
	se.Router.DELETE("/api/mc/workspaces/{id}", removeWorkspace(app))
	se.Router.GET("/api/mc/tree", tree(app))
	se.Router.GET("/api/mc/file", readFile(app))
	se.Router.PUT("/api/mc/file", writeFile(app))
	se.Router.POST("/api/mc/fs/create", createFile(app))
	se.Router.POST("/api/mc/fs/mkdir", makeFolder(app))
	se.Router.POST("/api/mc/fs/rename", renamePath(app))
	se.Router.POST("/api/mc/fs/delete", deletePath(app))
	se.Router.GET("/api/mc/views", getView(app))
	se.Router.PUT("/api/mc/views", putView(app))
	se.Router.POST("/api/mc/index/scan", scanIndex(app))
	se.Router.GET("/api/mc/artifacts", listArtifacts(app))
}

// fail turns a service error into an API error. Anything without a status is
// logged and reported as a generic 500, so no internal detail leaks.
func fail(e *core.RequestEvent, err error) error {
	if se, ok := statusOf(err); ok {
		if se.Data != nil {
			return apiJSON(e, se.Status, se.Message, se.Data)
		}
		return e.Error(se.Status, se.Message, nil)
	}
	log.Printf("mc-local: %v", err)
	return e.Error(errInternal.Status, errInternal.Message, nil)
}

func health(e *core.RequestEvent) error {
	return e.JSON(200, map[string]any{"ok": true, "service": "mc-local", "version": version})
}

func workspaceRoot(app core.App, id string) (Root, error) {
	if id == "" {
		return Root{}, statusErr(400, "Pick a workspace first.")
	}
	rec, err := app.FindRecordById("workspaces", id)
	if err != nil {
		return Root{}, statusErr(404, "That workspace isn't in MouseComb any more.")
	}
	return openRoot(rec.GetString("root"))
}

type workspaceDTO struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Root string `json:"root"`
}

func listWorkspaces(app core.App) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		recs, err := app.FindRecordsByFilter("workspaces", "", "+name", 0, 0)
		if err != nil {
			return fail(e, err)
		}
		out := make([]workspaceDTO, 0, len(recs))
		for _, r := range recs {
			out = append(out, workspaceDTO{ID: r.Id, Name: r.GetString("name"), Root: r.GetString("root")})
		}
		return e.JSON(200, out)
	}
}

func addWorkspace(app core.App) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var req struct {
			Name string `json:"name"`
			Path string `json:"path"`
		}
		if err := e.BindBody(&req); err != nil {
			return e.BadRequestError("Send a folder path.", nil)
		}
		root, err := openRoot(req.Path)
		if err != nil {
			return fail(e, err)
		}
		if existing, _ := app.FindFirstRecordByFilter("workspaces", "root = {:root}", dbxParams("root", root.path)); existing != nil {
			return fail(e, statusErr(409, "This folder is already a workspace."))
		}
		col, err := app.FindCollectionByNameOrId("workspaces")
		if err != nil {
			return fail(e, err)
		}
		rec := core.NewRecord(col)
		name := req.Name
		if name == "" {
			name = filepath.Base(root.path)
		}
		rec.Set("name", name)
		rec.Set("root", root.path)
		if err := app.Save(rec); err != nil {
			return fail(e, err)
		}
		audit(app, "workspace.add", rec.Id, "", "")
		return e.JSON(200, workspaceDTO{ID: rec.Id, Name: name, Root: root.path})
	}
}

// removeWorkspace forgets a workspace and its index. It never touches the
// files on disk.
func removeWorkspace(app core.App) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		id := e.Request.PathValue("id")
		rec, err := app.FindRecordById("workspaces", id)
		if err != nil {
			return fail(e, statusErr(404, "That workspace isn't in MouseComb any more."))
		}
		for _, table := range []string{"artifacts", "views"} {
			rows, err := app.FindRecordsByFilter(table, "workspace = {:ws}", "", 0, 0, dbxParams("ws", id))
			if err != nil {
				return fail(e, err)
			}
			for _, row := range rows {
				if err := app.Delete(row); err != nil {
					return fail(e, err)
				}
			}
		}
		if err := app.Delete(rec); err != nil {
			return fail(e, err)
		}
		audit(app, "workspace.remove", id, "", "")
		return e.NoContent(204)
	}
}

func tree(app core.App) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		root, err := workspaceRoot(app, e.Request.URL.Query().Get("workspace"))
		if err != nil {
			return fail(e, err)
		}
		list, err := root.List(e.Request.URL.Query().Get("path"))
		if err != nil {
			return fail(e, err)
		}
		return e.JSON(200, list)
	}
}

func readFile(app core.App) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		root, err := workspaceRoot(app, e.Request.URL.Query().Get("workspace"))
		if err != nil {
			return fail(e, err)
		}
		doc, err := root.Read(e.Request.URL.Query().Get("path"))
		if err != nil {
			return fail(e, err)
		}
		return e.JSON(200, doc)
	}
}

type writeResult struct {
	Meta
	Warning string `json:"warning,omitempty"`
}

// writeFile saves a file. A Markdown file is refused, with nothing written,
// if its status jumps where the rules don't allow, or if its frontmatter is
// invalid. Other files are only checked for conflicts.
func writeFile(app core.App) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var req struct {
			Workspace    string `json:"workspace"`
			Path         string `json:"path"`
			Content      string `json:"content"`
			ExpectedHash string `json:"expected_hash"`
		}
		if err := e.BindBody(&req); err != nil {
			return e.BadRequestError("Send the file's path, content and hash.", nil)
		}
		root, err := workspaceRoot(app, req.Workspace)
		if err != nil {
			return fail(e, err)
		}
		clean, err := cleanRel(req.Path)
		if err != nil {
			return fail(e, err)
		}

		var from string
		var next Parsed
		isDoc := kindOf(clean) == kindDocument
		if isDoc {
			old, err := root.Read(clean)
			switch {
			case err == nil:
				// A stale hash is a conflict first: report it before judging the new text.
				if req.ExpectedHash != old.Hash {
					return fail(e, &statusError{
						Status:  409,
						Message: "This file changed on disk since you opened it. Reload it, or save as a new file.",
						Data:    map[string]any{"hash": old.Hash},
					})
				}
				if !old.Binary {
					from = parseMarkdown(old.Content).Status
				}
			case err != nil:
				if se, ok := statusOf(err); !ok || se.Status != 404 {
					return fail(e, err)
				}
			}
			next = parseMarkdown(req.Content)
			if len(next.Problems) > 0 {
				return problemsError(e, next.Problems)
			}
			if err := checkTransition(from, next.Status); err != nil {
				return fail(e, err)
			}
		}

		meta, err := root.Write(clean, req.Content, req.ExpectedHash)
		if err != nil {
			return fail(e, err)
		}
		res := writeResult{Meta: meta}
		if kindOf(clean) != "" {
			if _, err := indexFile(app, req.Workspace, clean, req.Content, meta.Size, meta.Mtime, meta.Hash); err != nil {
				log.Printf("mc-local: index %s: %v", clean, err)
				res.Warning = "Saved, but the index didn't update. Rescan the workspace to fix it."
			}
		}
		detail := ""
		if isDoc && from != next.Status {
			detail = from + " -> " + next.Status
		}
		audit(app, "file.save", req.Workspace, clean, detail)
		return e.JSON(200, res)
	}
}

// problemsError answers 422 with the list of problems, in the same shape as
// every other API error (status, message, data).
func problemsError(e *core.RequestEvent, problems []Problem) error {
	return apiJSON(e, 422, "Fix the frontmatter first, then save.", map[string]any{"problems": problems})
}

// apiJSON writes an error in the API's usual shape, keeping data exactly as
// given. PocketBase's own error helper would rewrite the data values.
func apiJSON(e *core.RequestEvent, status int, message string, data map[string]any) error {
	return e.JSON(status, map[string]any{"status": status, "message": message, "data": data})
}

func createFile(app core.App) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var req struct {
			Workspace string `json:"workspace"`
			Path      string `json:"path"`
			Content   string `json:"content"`
		}
		if err := e.BindBody(&req); err != nil {
			return e.BadRequestError("Send the new file's path.", nil)
		}
		root, err := workspaceRoot(app, req.Workspace)
		if err != nil {
			return fail(e, err)
		}
		if kindOf(req.Path) == kindDocument {
			if err := checkTransition("", parseMarkdown(req.Content).Status); err != nil {
				return fail(e, err)
			}
		}
		meta, err := root.Create(req.Path, req.Content)
		if err != nil {
			return fail(e, err)
		}
		if kindOf(meta.Path) != "" {
			if _, err := indexFile(app, req.Workspace, meta.Path, req.Content, meta.Size, meta.Mtime, meta.Hash); err != nil {
				log.Printf("mc-local: index %s: %v", meta.Path, err)
			}
		}
		audit(app, "file.create", req.Workspace, meta.Path, "")
		return e.JSON(200, meta)
	}
}

func makeFolder(app core.App) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var req struct {
			Workspace string `json:"workspace"`
			Path      string `json:"path"`
		}
		if err := e.BindBody(&req); err != nil {
			return e.BadRequestError("Send the new folder's path.", nil)
		}
		root, err := workspaceRoot(app, req.Workspace)
		if err != nil {
			return fail(e, err)
		}
		if err := root.Mkdir(req.Path); err != nil {
			return fail(e, err)
		}
		audit(app, "folder.create", req.Workspace, req.Path, "")
		return e.NoContent(204)
	}
}

// renamePath and deletePath rescan the workspace afterwards, because a folder
// can hold many indexed files.
func renamePath(app core.App) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var req struct {
			Workspace string `json:"workspace"`
			From      string `json:"from"`
			To        string `json:"to"`
		}
		if err := e.BindBody(&req); err != nil {
			return e.BadRequestError("Send the old and new paths.", nil)
		}
		root, err := workspaceRoot(app, req.Workspace)
		if err != nil {
			return fail(e, err)
		}
		if err := root.Rename(req.From, req.To); err != nil {
			return fail(e, err)
		}
		if _, err := scanWorkspace(app, req.Workspace, root); err != nil {
			log.Printf("mc-local: rescan after rename: %v", err)
		}
		audit(app, "path.rename", req.Workspace, req.To, req.From)
		return e.NoContent(204)
	}
}

func deletePath(app core.App) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var req struct {
			Workspace string `json:"workspace"`
			Path      string `json:"path"`
		}
		if err := e.BindBody(&req); err != nil {
			return e.BadRequestError("Send the path to delete.", nil)
		}
		root, err := workspaceRoot(app, req.Workspace)
		if err != nil {
			return fail(e, err)
		}
		if err := root.Delete(req.Path); err != nil {
			return fail(e, err)
		}
		if _, err := scanWorkspace(app, req.Workspace, root); err != nil {
			log.Printf("mc-local: rescan after delete: %v", err)
		}
		audit(app, "path.delete", req.Workspace, req.Path, "")
		return e.NoContent(204)
	}
}

func getView(app core.App) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		q := e.Request.URL.Query()
		rec, err := app.FindFirstRecordByFilter("views", "workspace = {:ws} && rel_path = {:path}", dbxParams2(q.Get("workspace"), q.Get("path")))
		if err != nil || rec == nil {
			return e.JSON(200, map[string]any{})
		}
		var settings map[string]any
		if err := rec.UnmarshalJSONField("settings", &settings); err != nil || settings == nil {
			return e.JSON(200, map[string]any{})
		}
		return e.JSON(200, settings)
	}
}

func putView(app core.App) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var req struct {
			Workspace string         `json:"workspace"`
			Path      string         `json:"path"`
			Settings  map[string]any `json:"settings"`
		}
		if err := e.BindBody(&req); err != nil {
			return e.BadRequestError("Send the workspace, path and settings.", nil)
		}
		clean, err := cleanRel(req.Path)
		if err != nil {
			return fail(e, err)
		}
		rec, err := app.FindFirstRecordByFilter("views", "workspace = {:ws} && rel_path = {:path}", dbxParams2(req.Workspace, clean))
		if err != nil || rec == nil {
			col, err := app.FindCollectionByNameOrId("views")
			if err != nil {
				return fail(e, err)
			}
			rec = core.NewRecord(col)
			rec.Set("workspace", req.Workspace)
			rec.Set("rel_path", clean)
		}
		rec.Set("settings", req.Settings)
		if err := app.Save(rec); err != nil {
			return fail(e, err)
		}
		return e.NoContent(204)
	}
}

func scanIndex(app core.App) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		var req struct {
			Workspace string `json:"workspace"`
		}
		if err := e.BindBody(&req); err != nil {
			return e.BadRequestError("Send the workspace.", nil)
		}
		root, err := workspaceRoot(app, req.Workspace)
		if err != nil {
			return fail(e, err)
		}
		res, err := scanWorkspace(app, req.Workspace, root)
		if err != nil {
			return fail(e, err)
		}
		audit(app, "index.scan", req.Workspace, "", "")
		return e.JSON(200, res)
	}
}

func listArtifacts(app core.App) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		q := e.Request.URL.Query()
		filter := "workspace = {:ws}"
		params := dbxParams("ws", q.Get("workspace"))
		if status := q.Get("status"); status != "" {
			filter += " && status = {:status}"
			params["status"] = status
		}
		if kind := q.Get("kind"); kind != "" {
			filter += " && kind = {:kind}"
			params["kind"] = kind
		}
		recs, err := app.FindRecordsByFilter("artifacts", filter, "rel_path", 500, 0, params)
		if err != nil {
			return fail(e, err)
		}
		out := make([]map[string]any, 0, len(recs))
		for _, r := range recs {
			out = append(out, map[string]any{
				"path":     r.GetString("rel_path"),
				"kind":     r.GetString("kind"),
				"title":    r.GetString("title"),
				"status":   r.GetString("status"),
				"mtime":    r.GetInt("mtime"),
				"problems": r.Get("problems"),
			})
		}
		return e.JSON(200, out)
	}
}

// audit records what happened, never what was written: no content, no
// typed text. Telemetry rules (DEC-018) apply here too.
func audit(app core.App, action, workspace, rel, detail string) {
	col, err := app.FindCollectionByNameOrId("audit_logs")
	if err != nil {
		return
	}
	rec := core.NewRecord(col)
	rec.Set("at", time.Now().UnixMilli())
	rec.Set("action", action)
	rec.Set("workspace", workspace)
	rec.Set("rel_path", rel)
	rec.Set("detail", truncate(detail, 500))
	if err := app.Save(rec); err != nil {
		log.Printf("mc-local: audit: %v", err)
	}
}

// truncate cuts s to at most n bytes without splitting a UTF-8 character.
func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	cut := n
	for cut > 0 && !utf8.RuneStart(s[cut]) {
		cut--
	}
	return s[:cut]
}

func dbxParams(key, value string) dbx.Params {
	return dbx.Params{key: value}
}

func dbxParams2(ws, path string) dbx.Params {
	return dbx.Params{"ws": ws, "path": path}
}
