package main

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"unicode/utf8"
)

// Files the editor will open. Bigger files are refused: the editor loads
// whole files into memory.
const (
	maxEditBytes   = 20 << 20
	maxListEntries = 5000
)

var windowsReserved = func() map[string]bool {
	m := map[string]bool{"CON": true, "PRN": true, "AUX": true, "NUL": true}
	for i := 1; i <= 9; i++ {
		m[fmt.Sprintf("COM%d", i)] = true
		m[fmt.Sprintf("LPT%d", i)] = true
	}
	return m
}()

// Root is a workspace folder with its symlinks resolved. Every path the
// editor touches is checked against it.
type Root struct{ path string }

func openRoot(dir string) (Root, error) {
	if !filepath.IsAbs(dir) {
		return Root{}, statusErr(400, "The folder must be an absolute path.")
	}
	real, err := filepath.EvalSymlinks(dir)
	if err != nil {
		return Root{}, statusErr(404, "That folder doesn't exist any more.")
	}
	info, err := os.Stat(real)
	if err != nil || !info.IsDir() {
		return Root{}, statusErr(404, "That folder doesn't exist any more.")
	}
	return Root{path: real}, nil
}

// cleanRel turns a path from the UI into "a/b/c" with no leading or trailing
// slash. Backslashes are refused so Windows and Linux paths can't disagree.
func cleanRel(rel string) (string, error) {
	if strings.Contains(rel, `\`) {
		return "", statusErr(400, "Use / between folders.")
	}
	return strings.Trim(rel, "/"), nil
}

// checkName rejects names that escape a folder or that Windows can't store.
func checkName(name string) error {
	if name == "" || name == "." || name == ".." {
		return statusErr(403, "That path isn't allowed.")
	}
	if strings.ContainsAny(name, `<>:"|?*`) {
		return statusErr(400, fmt.Sprintf("%q has a character Windows doesn't allow in names.", name))
	}
	for _, r := range name {
		if r < 0x20 {
			return statusErr(400, "Names can't contain control characters.")
		}
	}
	if strings.HasSuffix(name, " ") || strings.HasSuffix(name, ".") {
		return statusErr(400, fmt.Sprintf("%q can't end with a space or a dot on Windows.", name))
	}
	stem, _, _ := strings.Cut(name, ".")
	if windowsReserved[strings.ToUpper(stem)] {
		return statusErr(400, fmt.Sprintf("%q is a name Windows reserves.", name))
	}
	return nil
}

// abs maps a workspace-relative path to a real path inside the root, or
// returns an error. The empty path is the root itself.
func (r Root) abs(rel string) (string, error) {
	clean, err := cleanRel(rel)
	if err != nil {
		return "", err
	}
	if clean == "" {
		return r.path, nil
	}
	for _, seg := range strings.Split(clean, "/") {
		if err := checkName(seg); err != nil {
			return "", err
		}
	}
	full := filepath.Join(r.path, filepath.FromSlash(clean))
	real, err := realPath(full)
	if err != nil || !within(r.path, real) {
		return "", statusErr(403, "That path is outside the workspace folder.")
	}
	return full, nil
}

// realPath resolves symlinks in the longest part of p that exists, so a
// file that doesn't exist yet is still checked against its real folder.
func realPath(p string) (string, error) {
	var tail []string
	cur := p
	for {
		if _, err := os.Lstat(cur); err == nil {
			real, err := filepath.EvalSymlinks(cur)
			if err != nil {
				return "", err
			}
			for i := len(tail) - 1; i >= 0; i-- {
				real = filepath.Join(real, tail[i])
			}
			return real, nil
		}
		parent := filepath.Dir(cur)
		if parent == cur {
			return "", errors.New("no existing folder above " + p)
		}
		tail = append(tail, filepath.Base(cur))
		cur = parent
	}
}

func within(root, p string) bool {
	rel, err := filepath.Rel(root, p)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}

type Entry struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	Dir   bool   `json:"dir"`
	Link  bool   `json:"link"`
	Size  int64  `json:"size"`
	Mtime int64  `json:"mtime"`
}

type Listing struct {
	Path      string  `json:"path"`
	Entries   []Entry `json:"entries"`
	Truncated bool    `json:"truncated"`
}

// Doc is a file's content with what the next save must match.
type Doc struct {
	Path    string `json:"path"`
	Content string `json:"content"`
	Hash    string `json:"hash"`
	Size    int64  `json:"size"`
	Mtime   int64  `json:"mtime"`
	Binary  bool   `json:"binary"`
}

// Meta is what a write returns: no content, the new hash to save against.
type Meta struct {
	Path  string `json:"path"`
	Hash  string `json:"hash"`
	Size  int64  `json:"size"`
	Mtime int64  `json:"mtime"`
}

func hashOf(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func join(rel, name string) string {
	if rel == "" {
		return name
	}
	return rel + "/" + name
}

// List shows a folder's entries. Links are shown but never followed.
func (r Root) List(rel string) (Listing, error) {
	clean, err := cleanRel(rel)
	if err != nil {
		return Listing{}, err
	}
	dir, err := r.abs(clean)
	if err != nil {
		return Listing{}, err
	}
	info, err := os.Stat(dir)
	if err != nil {
		return Listing{}, statusErr(404, "That folder doesn't exist any more.")
	}
	if !info.IsDir() {
		return Listing{}, statusErr(400, "That's a file, not a folder.")
	}
	items, err := os.ReadDir(dir)
	if err != nil {
		return Listing{}, statusErr(500, "Can't read that folder.")
	}
	out := Listing{Path: clean, Entries: []Entry{}}
	for _, item := range items {
		if len(out.Entries) == maxListEntries {
			out.Truncated = true
			break
		}
		fi, err := item.Info()
		if err != nil {
			continue
		}
		link := fi.Mode()&fs.ModeSymlink != 0
		out.Entries = append(out.Entries, Entry{
			Name:  item.Name(),
			Path:  join(clean, item.Name()),
			Dir:   item.IsDir(),
			Link:  link,
			Size:  fi.Size(),
			Mtime: fi.ModTime().UnixMilli(),
		})
	}
	sort.SliceStable(out.Entries, func(i, j int) bool {
		a, b := out.Entries[i], out.Entries[j]
		if a.Dir != b.Dir {
			return a.Dir
		}
		return strings.ToLower(a.Name) < strings.ToLower(b.Name)
	})
	return out, nil
}

// isBinary is true for files with NUL bytes or that aren't UTF-8 text.
func isBinary(data []byte) bool {
	head := data
	if len(head) > 8000 {
		head = head[:8000]
	}
	return bytesContainsNUL(head) || !utf8.Valid(data)
}

func bytesContainsNUL(b []byte) bool {
	for _, c := range b {
		if c == 0 {
			return true
		}
	}
	return false
}

func (r Root) Read(rel string) (Doc, error) {
	full, err := r.abs(rel)
	if err != nil {
		return Doc{}, err
	}
	info, err := os.Stat(full)
	if err != nil {
		return Doc{}, statusErr(404, "That file doesn't exist any more.")
	}
	if info.IsDir() {
		return Doc{}, statusErr(400, "That's a folder, not a file.")
	}
	clean, _ := cleanRel(rel)
	if info.Size() > maxEditBytes {
		return Doc{}, statusErr(413, "This file is too big to edit here.")
	}
	data, err := os.ReadFile(full)
	if err != nil {
		return Doc{}, statusErr(500, "Can't read that file.")
	}
	doc := Doc{Path: clean, Hash: hashOf(data), Size: info.Size(), Mtime: info.ModTime().UnixMilli()}
	if isBinary(data) {
		doc.Binary = true
		return doc, nil
	}
	doc.Content = string(data)
	return doc, nil
}

// Write saves a file. expected is the hash the editor loaded; if the file
// changed since, the save is refused with the hash on disk.
func (r Root) Write(rel, content, expected string) (Meta, error) {
	clean, err := cleanRel(rel)
	if err != nil {
		return Meta{}, err
	}
	if clean == "" {
		return Meta{}, statusErr(400, "Pick a file, not the folder.")
	}
	full, err := r.abs(clean)
	if err != nil {
		return Meta{}, err
	}
	if len(content) > maxEditBytes {
		return Meta{}, statusErr(413, "This file is too big to save here.")
	}

	perm := fs.FileMode(0o644)
	target := full
	if real, err := filepath.EvalSymlinks(full); err == nil {
		target = real // save through a link into the same file, not over it
	}
	info, statErr := os.Stat(target)
	switch {
	case statErr == nil:
		if info.IsDir() {
			return Meta{}, statusErr(400, "That's a folder, not a file.")
		}
		current, err := os.ReadFile(target)
		if err != nil {
			return Meta{}, statusErr(500, "Can't read that file.")
		}
		if currentHash := hashOf(current); currentHash != expected {
			return Meta{}, &statusError{Status: 409, Message: "This file changed on disk since you opened it. Reload it, or save as a new file.", Data: map[string]any{"hash": currentHash}}
		}
		perm = info.Mode().Perm()
	case errors.Is(statErr, fs.ErrNotExist):
		if expected != "" {
			return Meta{}, &statusError{Status: 409, Message: "This file was deleted or renamed since you opened it.", Data: map[string]any{"hash": ""}}
		}
	default:
		return Meta{}, statusErr(500, "Can't write that file.")
	}

	data := []byte(content)
	if err := atomicWrite(target, data, perm); err != nil {
		return Meta{}, statusErr(500, "Couldn't save the file. Nothing was changed.")
	}
	after, err := os.Stat(target)
	if err != nil {
		return Meta{}, statusErr(500, "Saved, but couldn't read the file back.")
	}
	return Meta{Path: clean, Hash: hashOf(data), Size: after.Size(), Mtime: after.ModTime().UnixMilli()}, nil
}

// Create makes a new file. It refuses to overwrite one.
func (r Root) Create(rel, content string) (Meta, error) {
	clean, err := cleanRel(rel)
	if err != nil {
		return Meta{}, err
	}
	full, err := r.abs(clean)
	if err != nil {
		return Meta{}, err
	}
	if _, err := os.Lstat(full); err == nil {
		return Meta{}, statusErr(409, "A file or folder with that name already exists.")
	}
	if err := requireDir(filepath.Dir(full)); err != nil {
		return Meta{}, err
	}
	return r.Write(clean, content, "")
}

func (r Root) Mkdir(rel string) error {
	clean, err := cleanRel(rel)
	if err != nil {
		return err
	}
	full, err := r.abs(clean)
	if err != nil {
		return err
	}
	if _, err := os.Lstat(full); err == nil {
		return statusErr(409, "A file or folder with that name already exists.")
	}
	if err := requireDir(filepath.Dir(full)); err != nil {
		return err
	}
	if err := os.Mkdir(full, 0o755); err != nil {
		return statusErr(500, "Couldn't create the folder.")
	}
	return nil
}

// Rename moves a file or folder inside the workspace.
func (r Root) Rename(from, to string) error {
	fromClean, err := cleanRel(from)
	if err != nil {
		return err
	}
	toClean, err := cleanRel(to)
	if err != nil {
		return err
	}
	if fromClean == "" || toClean == "" {
		return statusErr(400, "The workspace folder itself can't be renamed here.")
	}
	src, err := r.abs(fromClean)
	if err != nil {
		return err
	}
	dst, err := r.abs(toClean)
	if err != nil {
		return err
	}
	if _, err := os.Lstat(src); err != nil {
		return statusErr(404, "That file or folder doesn't exist any more.")
	}
	if _, err := os.Lstat(dst); err == nil {
		return statusErr(409, "A file or folder with the new name already exists.")
	}
	if err := requireDir(filepath.Dir(dst)); err != nil {
		return err
	}
	if err := os.Rename(src, dst); err != nil {
		return statusErr(500, "Couldn't rename it.")
	}
	return nil
}

// Delete removes a file or folder for good. The editor asks first; there is
// no trash folder yet.
func (r Root) Delete(rel string) error {
	clean, err := cleanRel(rel)
	if err != nil {
		return err
	}
	if clean == "" {
		return statusErr(400, "The workspace folder itself can't be deleted here.")
	}
	full, err := r.abs(clean)
	if err != nil {
		return err
	}
	fi, err := os.Lstat(full)
	if err != nil {
		return statusErr(404, "That file or folder doesn't exist any more.")
	}
	if fi.IsDir() && fi.Mode()&fs.ModeSymlink == 0 {
		return os.RemoveAll(full)
	}
	return os.Remove(full)
}

func requireDir(p string) error {
	info, err := os.Stat(p)
	if err != nil || !info.IsDir() {
		return statusErr(404, "The folder this goes in doesn't exist.")
	}
	return nil
}

// atomicWrite writes to a temporary file next to the target, flushes it to
// disk, then renames it over the target. A crash leaves the old file intact.
func atomicWrite(path string, data []byte, perm fs.FileMode) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), ".mc-save-*.tmp")
	if err != nil {
		return err
	}
	name := tmp.Name()
	done := false
	defer func() {
		if !done {
			_ = os.Remove(name)
		}
	}()
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(name, perm); err != nil {
		return err
	}
	if err := os.Rename(name, path); err != nil {
		return err
	}
	done = true
	return nil
}
