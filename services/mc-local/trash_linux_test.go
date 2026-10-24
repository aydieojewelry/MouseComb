//go:build linux

package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMoveToTrashWritesRestorableRecord(t *testing.T) {
	data := t.TempDir()
	t.Setenv("XDG_DATA_HOME", data)
	dir := t.TempDir()
	src := filepath.Join(dir, "a b.md")
	if err := os.WriteFile(src, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := moveToTrash(src); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Lstat(src); !os.IsNotExist(err) {
		t.Fatal("the original should be gone")
	}
	info, err := os.ReadFile(filepath.Join(data, "Trash", "info", "a b.md.trashinfo"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(string(info), "[Trash Info]\nPath=") || !strings.Contains(string(info), "a%20b.md") {
		t.Fatalf("trash record should name the original path, percent-encoded:\n%s", info)
	}

	// A second file with the same name gets a new name instead of overwriting.
	if err := os.WriteFile(src, []byte("y"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := moveToTrash(src); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Lstat(filepath.Join(data, "Trash", "files", "a b.md.2")); err != nil {
		t.Fatalf("second item should be kept under a new name: %v", err)
	}
}
