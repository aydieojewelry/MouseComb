package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// errNoTrash means the OS trash can't be used here. Delete then does nothing,
// so a failed trash never falls back to a permanent delete.
var errNoTrash = errors.New("no trash on this system")

// moveUniqueInto moves path into dir under a name no file there has yet.
// Used where the platform has no metadata to write (macOS).
func moveUniqueInto(dir, path string) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	name := filepath.Base(path)
	for i := range 1000 {
		candidate := name
		if i > 0 {
			candidate = fmt.Sprintf("%s %d", name, i+1)
		}
		dest := filepath.Join(dir, candidate)
		if _, err := os.Lstat(dest); err == nil {
			continue
		}
		return os.Rename(path, dest)
	}
	return errors.New("no free name in the trash")
}
