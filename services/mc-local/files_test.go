package main

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func newRoot(t *testing.T) Root {
	t.Helper()
	r, err := openRoot(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func codeOf(err error) int {
	if se, ok := statusOf(err); ok {
		return se.Status
	}
	return 0
}

func TestPathsCannotLeaveTheWorkspace(t *testing.T) {
	r := newRoot(t)
	for _, rel := range []string{"../x", "a/../../x", "a/..", "."} {
		if _, err := r.abs(rel); err == nil {
			t.Errorf("abs(%q) should be refused", rel)
		}
	}
	if _, err := r.abs(`a\b`); codeOf(err) != 400 {
		t.Errorf("backslashes should be refused with 400, got %v", err)
	}
}

func TestWindowsUnsafeNamesAreRefused(t *testing.T) {
	r := newRoot(t)
	for _, rel := range []string{"CON.md", "nul", "com3.txt", "a:b.md", "trailing.", "trail ", "bad<name"} {
		if _, err := r.abs(rel); codeOf(err) != 400 {
			t.Errorf("abs(%q) should be a 400, got %v", rel, err)
		}
	}
	if _, err := r.abs("notes/plan.md"); err != nil {
		t.Errorf("an ordinary name should pass: %v", err)
	}
}

func TestSymlinkOutOfTheWorkspaceIsRefused(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlinks need admin rights on Windows test machines")
	}
	r := newRoot(t)
	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "secret.txt"), []byte("no"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(r.path, "link")); err != nil {
		t.Fatal(err)
	}
	if _, err := r.abs("link/secret.txt"); codeOf(err) != 403 {
		t.Fatalf("a link pointing outside must be a 403, got %v", err)
	}
	list, err := r.List("")
	if err != nil {
		t.Fatal(err)
	}
	if len(list.Entries) != 1 || !list.Entries[0].Link || list.Entries[0].Dir {
		t.Fatalf("links are listed, not followed: %+v", list.Entries)
	}
}

func TestWriteChecksTheHashAndLeavesNoTempFiles(t *testing.T) {
	r := newRoot(t)
	first, err := r.Create("plan.md", "one")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := r.Create("plan.md", "again"); codeOf(err) != 409 {
		t.Fatalf("create over an existing file must be a 409, got %v", err)
	}
	if _, err := r.Write("plan.md", "two", "stale"); codeOf(err) != 409 {
		t.Fatalf("a stale hash must be a 409, got %v", err)
	}
	next, err := r.Write("plan.md", "two", first.Hash)
	if err != nil {
		t.Fatal(err)
	}
	doc, err := r.Read("plan.md")
	if err != nil || doc.Content != "two" || doc.Hash != next.Hash {
		t.Fatalf("read back %+v err %v", doc, err)
	}
	entries, _ := os.ReadDir(r.path)
	for _, e := range entries {
		if strings.Contains(e.Name(), ".mc-save-") {
			t.Fatalf("temp file left behind: %s", e.Name())
		}
	}
}

func TestBinaryFilesAreNotLoadedAsText(t *testing.T) {
	r := newRoot(t)
	if err := os.WriteFile(filepath.Join(r.path, "pic.bin"), []byte{0x89, 0x00, 'P', 'N', 'G'}, 0o644); err != nil {
		t.Fatal(err)
	}
	doc, err := r.Read("pic.bin")
	if err != nil {
		t.Fatal(err)
	}
	if !doc.Binary || doc.Content != "" {
		t.Fatalf("binary file should come back empty and flagged: %+v", doc)
	}
}

func TestListSortsFoldersFirst(t *testing.T) {
	r := newRoot(t)
	for _, name := range []string{"b.md", "A.md"} {
		if _, err := r.Create(name, "x"); err != nil {
			t.Fatal(err)
		}
	}
	if err := r.Mkdir("zeta"); err != nil {
		t.Fatal(err)
	}
	list, err := r.List("")
	if err != nil {
		t.Fatal(err)
	}
	got := []string{}
	for _, e := range list.Entries {
		got = append(got, e.Name)
	}
	if strings.Join(got, ",") != "zeta,A.md,b.md" {
		t.Fatalf("order %v", got)
	}
}

func TestRenameAndDelete(t *testing.T) {
	t.Setenv("XDG_DATA_HOME", t.TempDir()) // the trash lives under here, not the real one
	r := newRoot(t)
	if _, err := r.Create("a.md", "x"); err != nil {
		t.Fatal(err)
	}
	if err := r.Rename("a.md", "b.md"); err != nil {
		t.Fatal(err)
	}
	if err := r.Rename("b.md", "b.md"); codeOf(err) != 409 {
		t.Fatalf("renaming onto an existing name must be a 409, got %v", err)
	}
	if err := r.Delete("b.md"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Lstat(filepath.Join(r.path, "b.md")); !os.IsNotExist(err) {
		t.Fatal("the deleted file should be gone from the workspace")
	}
	if err := r.Delete(""); codeOf(err) != 400 {
		t.Fatalf("the workspace folder itself must not be deletable, got %v", err)
	}
}
