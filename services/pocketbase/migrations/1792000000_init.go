package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

// Collections:
//   - users   (built in): email + password accounts
//   - items:  every synced record (settings, snippets, bindings, workflows,
//     extension data), told apart by `kind`. New kinds need no migration.
//   - devices: the PCs and phones signed in to an account
func init() {
	m.Register(func(app core.App) error {
		settings := app.Settings()
		settings.Meta.AppName = "MouseComb"
		settings.RateLimits.Enabled = true
		if err := app.Save(settings); err != nil {
			return err
		}

		users, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		ownerOnly := types.Pointer("user = @request.auth.id")
		createOwn := types.Pointer(`@request.auth.id != "" && @request.body.user = @request.auth.id`)

		items := core.NewBaseCollection("items")
		items.ListRule = ownerOnly
		items.ViewRule = ownerOnly
		items.CreateRule = createOwn
		items.UpdateRule = ownerOnly
		items.DeleteRule = ownerOnly
		items.Fields.Add(
			&core.RelationField{Name: "user", CollectionId: users.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
			&core.TextField{Name: "kind", Required: true, Max: 64, Pattern: `^[a-z][a-z0-9_.-]*$`},
			&core.TextField{Name: "key", Required: true, Max: 255},
			&core.JSONField{Name: "data", MaxSize: 256 * 1024},
			&core.NumberField{Name: "mtime", OnlyInt: true, Required: true},
			&core.BoolField{Name: "deleted"},
			&core.TextField{Name: "device", Max: 64},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		items.AddIndex("idx_items_user_kind_key", true, "user, kind, key", "")
		items.AddIndex("idx_items_user_updated", false, "user, updated", "")
		if err := app.Save(items); err != nil {
			return err
		}

		devices := core.NewBaseCollection("devices")
		devices.ListRule = ownerOnly
		devices.ViewRule = ownerOnly
		devices.CreateRule = createOwn
		devices.UpdateRule = ownerOnly
		devices.DeleteRule = ownerOnly
		devices.Fields.Add(
			&core.RelationField{Name: "user", CollectionId: users.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
			&core.TextField{Name: "name", Required: true, Max: 120},
			&core.TextField{Name: "platform", Max: 32},
			&core.TextField{Name: "app_version", Max: 32},
			&core.DateField{Name: "last_seen"},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		return app.Save(devices)
	}, func(app core.App) error {
		for _, name := range []string{"devices", "items"} {
			collection, err := app.FindCollectionByNameOrId(name)
			if err != nil {
				return err
			}
			if err := app.Delete(collection); err != nil {
				return err
			}
		}
		return nil
	})
}
