//go:build windows

package main

import (
	"fmt"
	"runtime"
	"syscall"
	"unsafe"
)

// The SHFileOperation flags and struct from shellapi.h.
const (
	foDelete          = 0x0003
	fofSilent         = 0x0004
	fofAllowUndo      = 0x0040
	fofNoConfirmation = 0x0010
	fofNoErrorUI      = 0x0400
)

type shFileOpStruct struct {
	hwnd                  uintptr
	wFunc                 uint32
	pFrom                 *uint16
	pTo                   *uint16
	fFlags                uint16
	fAnyOperationsAborted int32
	hNameMappings         uintptr
	lpszProgressTitle     *uint16
}

var shFileOperation = syscall.NewLazyDLL("shell32.dll").NewProc("SHFileOperationW")

// moveToTrash sends the item to the Recycle Bin, where Windows can restore it.
func moveToTrash(path string) error {
	// SHFileOperation reads a double-NUL-terminated list of paths.
	from, err := syscall.UTF16FromString(path)
	if err != nil {
		return err
	}
	from = append(from, 0)
	op := shFileOpStruct{
		wFunc:  foDelete,
		pFrom:  &from[0],
		fFlags: fofAllowUndo | fofNoConfirmation | fofSilent | fofNoErrorUI,
	}
	ret, _, callErr := shFileOperation.Call(uintptr(unsafe.Pointer(&op)))
	runtime.KeepAlive(from)
	if ret != 0 || op.fAnyOperationsAborted != 0 {
		return fmt.Errorf("SHFileOperation: %d (%v)", ret, callErr)
	}
	return nil
}
