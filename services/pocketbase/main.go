// MouseComb backend: PocketBase embedded as a Go framework.
//
// One binary serves auth (users), the synced `items` collection and the
// `devices` collection. Run `go run . serve` for local development; see
// README.md for free 24/7 hosting options.
package main

import (
	"log"
	"net/http"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"

	_ "github.com/aydieojewelry/mousecomb/services/pocketbase/migrations"
)

func main() {
	app := pocketbase.New()

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		// Schema changes go through reviewed Go migrations only.
		Automigrate: false,
	})

	registerItemHooks(app)

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}

// registerItemHooks enforces the sync rules the client relies on:
// owner fields are immutable and an older write never replaces a newer one
// (last writer wins by the client's `mtime`).
func registerItemHooks(app core.App) {
	app.OnRecordUpdateRequest("items").BindFunc(func(e *core.RecordRequestEvent) error {
		original := e.Record.Original()

		for _, field := range []string{"user", "kind", "key"} {
			if e.Record.GetString(field) != original.GetString(field) {
				return apis.NewForbiddenError("The "+field+" of a synced item can't change.", nil)
			}
		}

		if e.Record.GetInt64("mtime") < original.GetInt64("mtime") {
			return apis.NewApiError(http.StatusConflict, "A newer version of this item already exists.", map[string]any{
				"mtime": original.GetInt64("mtime"),
			})
		}

		return e.Next()
	})
}
