package main

import (
	"database/sql"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The index is a copy of what the workspace folders hold, for search and
// views. The file on disk is always the truth; scanning the folder rebuilds
// the index from it.

const (
	maxIndexBytes = 2 << 20
	kindDocument  = "document"
	kindTable     = "table_dataset"
	kindConfig    = "config_artifact"
)

// kindOf says how the editor treats a file, by extension. Empty means the
// file isn't indexed.
func kindOf(rel string) string {
	switch strings.ToLower(filepath.Ext(rel)) {
	case ".md", ".markdown":
		return kindDocument
	case ".csv", ".tsv":
		return kindTable
	case ".toml", ".ini", ".cfg":
		return kindConfig
	}
	return ""
}

func findArtifact(app core.App, workspace, rel string) (*core.Record, error) {
	rec, err := app.FindFirstRecordByFilter("artifacts", "workspace = {:ws} && rel_path = {:path}", dbx.Params{"ws": workspace, "path": rel})
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return rec, err
}

// indexFile stores one file's row. A status the file can't legally reach from
// the one indexed before is kept out of the row and reported as a problem.
func indexFile(app core.App, workspace, rel string, content string, size int64, mtime int64, hash string) (Parsed, error) {
	kind := kindOf(rel)
	parsed := Parsed{Frontmatter: map[string]any{}, Headings: []Heading{}, Tasks: []Task{}, Problems: []Problem{}}
	if kind == kindDocument {
		parsed = parseMarkdown(content)
	}

	rec, err := findArtifact(app, workspace, rel)
	if err != nil {
		return parsed, err
	}
	if rec == nil {
		col, err := app.FindCollectionByNameOrId("artifacts")
		if err != nil {
			return parsed, err
		}
		rec = core.NewRecord(col)
		rec.Set("workspace", workspace)
		rec.Set("rel_path", rel)
	}

	status := parsed.Status
	if old := rec.GetString("status"); checkTransition(old, status) != nil {
		parsed.Problems = append(parsed.Problems, Problem{
			Path:    "status",
			Message: fmt.Sprintf("The status changed from %q to %q outside MouseComb. The index keeps %q until it's fixed.", old, status, old),
		})
		status = old
	}

	rec.Set("kind", kind)
	rec.Set("title", parsed.Title)
	rec.Set("status", status)
	rec.Set("frontmatter", parsed.Frontmatter)
	rec.Set("headings", parsed.Headings)
	rec.Set("tasks", parsed.Tasks)
	rec.Set("problems", parsed.Problems)
	rec.Set("size", size)
	rec.Set("mtime", mtime)
	rec.Set("hash", hash)
	if err := app.Save(rec); err != nil {
		return parsed, err
	}
	return parsed, nil
}

func removeArtifact(app core.App, workspace, rel string) error {
	rec, err := findArtifact(app, workspace, rel)
	if err != nil || rec == nil {
		return err
	}
	return app.Delete(rec)
}

type ScanResult struct {
	Indexed int `json:"indexed"`
	Removed int `json:"removed"`
	Skipped int `json:"skipped"`
}

// scanWorkspace rebuilds the index of one workspace from its folder. Links
// aren't followed, so a link can't pull in files from outside the folder.
func scanWorkspace(app core.App, workspace string, root Root) (ScanResult, error) {
	var res ScanResult
	seen := map[string]bool{}
	err := filepath.WalkDir(root.path, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			res.Skipped++
			return nil
		}
		if d.IsDir() {
			if p != root.path && (d.Name() == ".git" || d.Name() == "node_modules") {
				return filepath.SkipDir
			}
			return nil
		}
		if d.Type()&fs.ModeSymlink != 0 {
			res.Skipped++
			return nil
		}
		rel, err := filepath.Rel(root.path, p)
		if err != nil {
			res.Skipped++
			return nil
		}
		rel = filepath.ToSlash(rel)
		if kindOf(rel) == "" {
			return nil
		}
		info, err := d.Info()
		if err != nil || info.Size() > maxIndexBytes {
			res.Skipped++
			return nil
		}
		data, err := os.ReadFile(p)
		if err != nil {
			res.Skipped++
			return nil
		}
		if isBinary(data) {
			res.Skipped++
			return nil
		}
		if _, err := indexFile(app, workspace, rel, string(data), info.Size(), info.ModTime().UnixMilli(), hashOf(data)); err != nil {
			return err
		}
		seen[rel] = true
		res.Indexed++
		return nil
	})
	if err != nil {
		return res, err
	}

	stale, err := app.FindRecordsByFilter("artifacts", "workspace = {:ws}", "", 0, 0, dbx.Params{"ws": workspace})
	if err != nil {
		return res, err
	}
	for _, rec := range stale {
		if seen[rec.GetString("rel_path")] {
			continue
		}
		if err := app.Delete(rec); err != nil {
			return res, err
		}
		res.Removed++
	}
	return res, nil
}
