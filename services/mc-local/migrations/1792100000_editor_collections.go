package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Collections of the local editor service. Access is through the service's
// own routes only: rules stay unset, so the PocketBase API serves superusers
// alone, and the guard blocks the admin UI for everyone else.
//
//   - workspaces: the folders the user added, by absolute path
//   - artifacts:  the index of each file (kind, title, status, tasks, problems)
//   - views:      per-file view settings
//   - audit_logs: what happened and when, never the content
func init() {
	m.Register(func(app core.App) error {
		workspaces := core.NewBaseCollection("workspaces")
		workspaces.Fields.Add(
			&core.TextField{Name: "name", Required: true, Max: 200},
			&core.TextField{Name: "root", Required: true, Max: 4096},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		workspaces.AddIndex("idx_workspaces_root", true, "root", "")
		if err := app.Save(workspaces); err != nil {
			return err
		}

		artifacts := core.NewBaseCollection("artifacts")
		artifacts.Fields.Add(
			&core.TextField{Name: "workspace", Required: true, Max: 64},
			&core.TextField{Name: "rel_path", Required: true, Max: 4096},
			&core.TextField{Name: "kind", Max: 32},
			&core.TextField{Name: "title", Max: 200},
			&core.TextField{Name: "status", Max: 40},
			&core.TextField{Name: "hash", Max: 64},
			&core.JSONField{Name: "frontmatter", MaxSize: 256 * 1024},
			&core.JSONField{Name: "headings", MaxSize: 256 * 1024},
			&core.JSONField{Name: "tasks", MaxSize: 512 * 1024},
			&core.JSONField{Name: "problems", MaxSize: 64 * 1024},
			&core.NumberField{Name: "size", OnlyInt: true},
			&core.NumberField{Name: "mtime", OnlyInt: true},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		artifacts.AddIndex("idx_artifacts_ws_path", true, "workspace, rel_path", "")
		artifacts.AddIndex("idx_artifacts_ws_status", false, "workspace, status", "")
		if err := app.Save(artifacts); err != nil {
			return err
		}

		views := core.NewBaseCollection("views")
		views.Fields.Add(
			&core.TextField{Name: "workspace", Required: true, Max: 64},
			&core.TextField{Name: "rel_path", Required: true, Max: 4096},
			&core.JSONField{Name: "settings", MaxSize: 64 * 1024},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		views.AddIndex("idx_views_ws_path", true, "workspace, rel_path", "")
		if err := app.Save(views); err != nil {
			return err
		}

		audit := core.NewBaseCollection("audit_logs")
		audit.Fields.Add(
			&core.NumberField{Name: "at", Required: true, OnlyInt: true},
			&core.TextField{Name: "action", Required: true, Max: 64},
			&core.TextField{Name: "workspace", Max: 64},
			&core.TextField{Name: "rel_path", Max: 4096},
			&core.TextField{Name: "detail", Max: 500},
		)
		audit.AddIndex("idx_audit_at", false, "at", "")
		return app.Save(audit)
	}, func(app core.App) error {
		for _, name := range []string{"audit_logs", "views", "artifacts", "workspaces"} {
			col, err := app.FindCollectionByNameOrId(name)
			if err != nil {
				continue
			}
			if err := app.Delete(col); err != nil {
				return err
			}
		}
		return nil
	})
}
