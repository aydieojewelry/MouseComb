//go:build !linux && !darwin && !windows

package main

// moveToTrash has no trash to use on other systems, so delete refuses.
func moveToTrash(path string) error {
	return errNoTrash
}
