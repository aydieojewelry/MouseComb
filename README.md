# MouseComb

A Windows companion that lets you bind **any key, gesture or screen edge** to **any Windows command, setting or workflow**, then add more with **free extensions**. Your setup syncs to your other PCs and to the MouseComb phone app.

> **Status:** pre-production, build B-0004. The app shell, account sign-in and sync work. Hotkeys and gestures come next (M1).

## What works today
- Tray app that starts with Windows and keeps running when you close the window
- Settings window: General (with a live HUD preview), Snippets, Account & sync, About
- Everything saves locally first, then syncs through your own free PocketBase server

## Run it

Prerequisites: Rust (stable), Node 22 + pnpm 10, Go 1.27+ for the backend, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS (WebView2 is built into Windows 10/11).

```sh
pnpm install

# 1. Backend (keep it running)
cd services/pocketbase && go run . serve --http 127.0.0.1:8090

# 2. Desktop app (another terminal, repo root)
pnpm dev
```

Sign up in **Account & sync**. To preview only the UI in a browser with example data: `pnpm --filter @mousecomb/desktop dev`, then open http://localhost:1420.

## Check it
```sh
cargo test --workspace                     # add MC_TEST_PB_URL=http://127.0.0.1:8090 for live backend tests
cargo clippy --workspace --all-targets
pnpm -r typecheck && pnpm -r test
```

## Layout
| Path | What |
|---|---|
| `apps/desktop` | Tauri app: `src-tauri/` (Rust shell) and `src/` (React) |
| `packages/ui` | Design tokens, Ark UI components, icons |
| `packages/data` | Live data (TanStack DB + Query) over the Rust commands |
| `packages/bindings` | Typed client generated from Rust (`pnpm bindings`) |
| `crates/mc-core` · `mc-store` · `mc-sync` | Data model, local SQLite store, sync client |
| `services/pocketbase` | The backend, with free hosting notes |

## Stack
Tauri v2 + Rust · React 19 + TypeScript · Ark UI (Zag.js) · TanStack Router / DB / Query / Form / Virtual / Pacer · Tailwind v4 · SQLite · PocketBase.

## Docs
- [`APP_SPEC.md`](APP_SPEC.md): what we're building, architecture, data & sync, licensing, milestones (single source of truth)
- [`DEVLOG.md`](DEVLOG.md): build log until 1.0
- [`CLAUDE.md`](CLAUDE.md): rules and commands for AI agents
- [`services/pocketbase/README.md`](services/pocketbase/README.md): backend, deploy, free hosting
