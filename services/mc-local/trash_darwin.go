//go:build darwin

package main

import (
	"os"
	"path/filepath"
)

// moveToTrash moves the item into the user's ~/.Trash folder.
func moveToTrash(path string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	return moveUniqueInto(filepath.Join(home, ".Trash"), path)
}
