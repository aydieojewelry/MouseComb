// MouseComb's local editor service (FEAT-030): PocketBase embedded as a
// library, bound to 127.0.0.1 and started by the app when the editor opens.
//
// Run it the way the app does: `mc-local serve --http 127.0.0.1:PORT --dir DIR`,
// then write one line of JSON to stdin, {"token":"..."}. The service exits as
// soon as stdin closes, so it can't outlive the app.
package main

import (
	"bufio"
	"encoding/json"
	"io"
	"log"
	"os"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"

	_ "github.com/aydieojewelry/mousecomb/services/mc-local/migrations"
)

type config struct {
	Token string `json:"token"`
}

func main() {
	app := pocketbase.New()
	g := &guard{}

	go readConfig(os.Stdin, g)

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		registerRoutes(app, se, g)
		return se.Next()
	})
	// Every change to a status, however it arrives, goes through the same rule.
	app.OnRecordUpdate("artifacts").BindFunc(func(e *core.RecordEvent) error {
		return checkRecordStatus(e)
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}

// readConfig takes the token from the first stdin line. When stdin closes the
// parent app has gone, so the service stops too.
func readConfig(r io.Reader, g *guard) {
	sc := bufio.NewScanner(r)
	configured := false
	for sc.Scan() {
		if configured {
			continue
		}
		var cfg config
		if err := json.Unmarshal(sc.Bytes(), &cfg); err != nil || len(cfg.Token) < minTokenLength {
			log.Print("mc-local: the first line must be JSON with a token of at least 32 characters")
			os.Exit(1)
		}
		g.setToken(cfg.Token)
		configured = true
	}
	os.Exit(0)
}
