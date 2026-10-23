package main

import "github.com/pocketbase/pocketbase/core"

// checkRecordStatus is the database-level guard: a saved record can't take a
// status jump that the rules forbid, whichever code path saved it.
func checkRecordStatus(e *core.RecordEvent) error {
	from := e.Record.Original().GetString("status")
	to := e.Record.GetString("status")
	if err := checkTransition(from, to); err != nil {
		return err
	}
	return e.Next()
}
