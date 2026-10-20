# MouseComb

A Windows companion that lets you bind **any key, gesture or screen edge** to **any Windows command, setting or workflow**, then add more with **free extensions**. Your setup syncs to your other PCs and to the MouseComb phone app.

> **Status:** prototype **0.0.0+1** — [download it from Releases](https://github.com/aydieojewelry/MouseComb/releases). **M1 is built** for **Windows and Linux**: OmniBar with a Pomodoro timer, Clock with analog and digital faces, Pomodoro, first-launch sign-in and auto-updates. Self-updating releases start once the owner finishes the one-time GitHub setup in [`PIPELINE.md`](PIPELINE.md).

## What works today
- **OmniBar** on a global shortcut (`Alt+Space`, changeable): installed apps, commands, snippets, a calculator, web addresses and web search, Windows Settings pages, lock/sleep/restart (with a confirm step), and every Settings page
- **Clock** in the screen corner that fades when your mouse comes near and shows the Pomodoro countdown
- **Pomodoro** with notifications, a tray item, and focus stats that sync
- **First launch:** sign in, create an account or use it offline; password reset by email
- **Updates** download in the background and install on restart (release builds)
- Tray app that starts with Windows; everything saves locally first, then syncs through your own free PocketBase server

## Run it

Prerequisites: Rust (stable), Node 22 + pnpm 10, Go 1.27+ for the backend, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS (WebView2 is built into Windows 10/11).

```sh
pnpm install

# 1. Backend (keep it running)
cd services/pocketbase && go run . serve --http 127.0.0.1:8090

# 2. Desktop app (another terminal, repo root)
pnpm dev
```

The first launch shows the sign-in page; press `Alt+Space` for the OmniBar. To preview only the UI in a browser with example data: `pnpm --filter @mousecomb/desktop dev`, then open http://localhost:1420 (`#/omnibar` and `#/hud` show those windows).

## Check it
```sh
cargo test --workspace                     # add MC_TEST_PB_URL=http://127.0.0.1:8090 for live backend tests
cargo clippy --workspace --all-targets
pnpm -r typecheck && pnpm -r test
node --test "scripts/*.test.mjs"                       # release version script
```

## Layout
| Path | What |
|---|---|
| `apps/desktop` | Tauri app: `src-tauri/` (Rust shell) and `src/` (React) |
| `packages/ui` | Design tokens, Ark UI components, icons |
| `packages/data` | Live data (TanStack DB + Query) over the Rust commands |
| `packages/bindings` | Typed client generated from Rust (`pnpm bindings`) |
| `crates/mc-core` · `mc-store` · `mc-sync` | Data model, actions, Pomodoro timer, local SQLite store, sync client |
| `crates/mc-win` | Windows-only code: installed apps, power commands (later hooks and input) |
| `services/pocketbase` | The backend, with free hosting notes |

## Stack
Tauri v2 + Rust · React 19 + TypeScript · Ark UI (Zag.js) · TanStack Router / DB / Query / Form / Virtual / Pacer · Tailwind v4 · SQLite · PocketBase.

## Documents
Every human-readable file in the repo:

| File | What it's for |
|---|---|
| [`README.md`](README.md) | This page: what MouseComb is, how to run and check it |
| [`APP_SPEC.md`](APP_SPEC.md) | Single source of truth: features, architecture, data & sync, privacy, licensing, milestones, decisions |
| [`VERSIONING.md`](VERSIONING.md) | Version format `x.y.z+b`, how versions are chosen and released, branches (with git graphs) |
| [`CHANGELOG.md`](CHANGELOG.md) | What changed for users in each release |
| [`DEVLOG.md`](DEVLOG.md) | What each work session did, newest first |
| [`PIPELINE.md`](PIPELINE.md) | How a change gets from a branch to users: build loop, review, merge, weekly release, rollout, Insights add-on |
| [`CLAUDE.md`](CLAUDE.md) | Rules and commands for AI coding agents |
| [`AGENTS.md`](AGENTS.md) | Starting point for any AI agent (Antigravity, Codex, Cursor, …) |
| [`.claude/skills/steward/SKILL.md`](.claude/skills/steward/SKILL.md) | Step-by-step procedure agents follow: build-test loop → PR → approval → merge → release |
| [`.github/pull_request_template.md`](.github/pull_request_template.md) | Checklist every pull request fills in |
| [`services/pocketbase/README.md`](services/pocketbase/README.md) | The backend: running, deploying, free 24/7 hosting |

Coming with the first release: `CHANGELOG.md` (user-facing changes per version). Coming in M2: `reports/usage/` (weekly usage reports).
