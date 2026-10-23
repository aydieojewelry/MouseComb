package main

import (
	"crypto/subtle"
	"net"
	"net/http"
	"strings"
	"sync"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
)

// The local service is reachable by every process on this PC and by any web
// page open in a browser. So every request must pass three checks: the Host is
// this PC, the Origin (if sent) is MouseComb's own window, and the request
// carries the token that the app generated for this run.
//
// /api/mc/health is the only route without a token. It returns nothing private.
const tokenHeader = "X-MC-Token"

// minTokenLength keeps a weak token from being accepted by mistake.
const minTokenLength = 32

var allowedOrigins = map[string]bool{
	"tauri://localhost":       true, // macOS and Linux webviews
	"http://tauri.localhost":  true, // Windows (WebView2)
	"https://tauri.localhost": true,
	"http://localhost:1420":   true, // pnpm dev
	"http://127.0.0.1:1420":   true,
}

type guard struct {
	mu    sync.RWMutex
	token string
}

func (g *guard) setToken(token string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.token = token
}

func (g *guard) tokenMatches(given string) bool {
	g.mu.RLock()
	defer g.mu.RUnlock()
	if g.token == "" || given == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(g.token), []byte(given)) == 1
}

func isLocalHost(host string) bool {
	name, _, err := net.SplitHostPort(host)
	if err != nil {
		name = host
	}
	return name == "127.0.0.1" || name == "localhost"
}

// middleware runs before PocketBase's own CORS handler, so that a preflight
// from a page that isn't MouseComb's window is refused here. For allowed
// origins it answers the preflight itself, with the token header allowed.
func (g *guard) middleware() *hook.Handler[*core.RequestEvent] {
	return &hook.Handler[*core.RequestEvent]{
		Id:       "mc.guard",
		Priority: apis.DefaultCorsMiddlewarePriority - 1,
		Func: func(e *core.RequestEvent) error {
			r := e.Request
			if !isLocalHost(r.Host) {
				return e.ForbiddenError("MouseComb's local service only answers on this PC.", nil)
			}
			origin := r.Header.Get("Origin")
			if origin != "" && !allowedOrigins[origin] {
				return e.ForbiddenError("This page isn't allowed to use MouseComb's local service.", nil)
			}
			if r.Method == http.MethodOptions && origin != "" && strings.HasPrefix(r.URL.Path, "/api/mc/") {
				h := e.Response.Header()
				h.Set("Access-Control-Allow-Origin", origin)
				h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE")
				h.Set("Access-Control-Allow-Headers", "Content-Type, "+tokenHeader)
				h.Set("Access-Control-Max-Age", "600")
				h.Add("Vary", "Origin")
				return e.NoContent(http.StatusNoContent)
			}
			if r.URL.Path == "/api/mc/health" {
				return e.Next()
			}
			if !g.tokenMatches(r.Header.Get(tokenHeader)) {
				return e.UnauthorizedError("The local service needs the token MouseComb started it with.", nil)
			}
			return e.Next()
		},
	}
}
