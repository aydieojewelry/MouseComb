//go:build linux

package main

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"time"
)

// moveToTrash follows the freedesktop.org trash specification: the item moves
// to $XDG_DATA_HOME/Trash/files and a .trashinfo file records where it came
// from, so file managers can restore it. The info file is claimed first, which
// keeps two deletes of the same name from colliding.
func moveToTrash(path string) error {
	base := os.Getenv("XDG_DATA_HOME")
	if base == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return err
		}
		base = filepath.Join(home, ".local", "share")
	}
	files := filepath.Join(base, "Trash", "files")
	infos := filepath.Join(base, "Trash", "info")
	for _, dir := range []string{files, infos} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return err
		}
	}

	name := filepath.Base(path)
	for i := range 1000 {
		candidate := name
		if i > 0 {
			candidate = fmt.Sprintf("%s.%d", name, i+1)
		}
		infoPath := filepath.Join(infos, candidate+".trashinfo")
		info, err := os.OpenFile(infoPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
		if os.IsExist(err) {
			continue
		}
		if err != nil {
			return err
		}
		dest := filepath.Join(files, candidate)
		if _, err := os.Lstat(dest); err == nil {
			_ = info.Close()
			_ = os.Remove(infoPath)
			continue
		}
		body := fmt.Sprintf("[Trash Info]\nPath=%s\nDeletionDate=%s\n",
			(&url.URL{Path: path}).EscapedPath(), time.Now().Format("2006-01-02T15:04:05"))
		if _, err := info.WriteString(body); err != nil {
			_ = info.Close()
			_ = os.Remove(infoPath)
			return err
		}
		if err := info.Close(); err != nil {
			_ = os.Remove(infoPath)
			return err
		}
		if err := os.Rename(path, dest); err != nil {
			_ = os.Remove(infoPath)
			return err
		}
		return nil
	}
	return errors.New("no free name in the trash")
}
