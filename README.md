# MouseComb

A tray app for **Windows and Linux**: bind any **hotkey, CapsLock key or mouse gesture** to any action, type **snippets** anywhere, run a **Pomodoro**, see a **clock** in the corner of the screen, and search, calculate or jump to a site from one **OmniBar** (`Alt+Space`). Your setup syncs through your own free server, or stays offline.

> [!NOTE]
> **Status:** prototype **0.1.0+2**, [download from Releases](https://github.com/aydieojewelry/MouseComb/releases). Hotkeys, Hyper-Key and gestures start **off**: one switch in Settings → Bindings; `Ctrl+Alt+Pause` turns them off again. **Working on this repo with an AI agent? Start at [`CR/CR.md`](CR/CR.md) and say `>resume`.**

## What it does
- **Hotkeys, CapsLock Hyper-Key and mouse gestures** → any action (Windows hooks; Linux has hotkeys on X11)
- **Snippets** you copy in one step or have typed for you, with `{DATE}`, `{TIME}`, `{USER}`, `{CLIPBOARD}`
- **Pomodoro** with notifications, a timer view in the OmniBar and synced focus stats
- **Clock widget** with analog and digital faces that fades when your mouse comes near
- **OmniBar:** apps, commands, snippets, a calculator, web addresses, web search and DuckDuckGo-style **bangs** (`!yt cats`, plus your own)
- **Updates and What's New:** installed copies find new versions by themselves and show what changed

## Run it
```sh
pnpm install
cd services/pocketbase && go run . serve --http 127.0.0.1:8090   # backend, keep running
pnpm dev                                                          # the app
pnpm --filter @mousecomb/desktop dev                              # or only the UI in a browser: http://localhost:1420
```
On Windows you can double-click the files in [`scripts/win`](scripts/win/README.md) instead. All commands, local addresses, tunnelling and checks: **Launch** in [`CR/CR.md`](CR/CR.md#launch).

## Layout
| Path | What |
|---|---|
| `apps/desktop` | Tauri app: `src-tauri/` (Rust shell) and `src/` (React) |
| `packages/ui` · `data` · `bindings` | Design tokens and components · live data · typed client generated from Rust |
| `crates/mc-core` · `mc-store` · `mc-sync` · `mc-win` | Pure logic and input engine · SQLite store · sync client · Windows-only code |
| `services/pocketbase` | The backend, with free hosting notes |
| `scripts` | Release versions, the docs check, and the Windows `.bat` commands |
| `CR` | The hand-off folder: state, rules, spec, log, backlog |

Tauri v2 + Rust · React 19 + TypeScript · Ark UI (Zag.js) · TanStack Router / DB / Query / Form / Virtual · Tailwind v4 · SQLite · PocketBase.

## Documents
Every human-readable file in the repo (`node scripts/docs-check.mjs` fails if one is missing here):

| File | What it's for |
|---|---|
| [`README.md`](README.md) | This page |
| [`CR/CR.md`](CR/CR.md) | **Start here.** State, commands, Launch, Versioning (git graph), rules, and the TOON knowledge block for agents |
| [`CR/META-RULES.md`](CR/META-RULES.md) | How we work: the owner's preferences, rules, design intents, workflows, lessons, reply style, the human-in-the-loop system, app-shell-first SOP |
| [`CR/BACKLOG.md`](CR/BACKLOG.md) | Ideas not yet planned, with design notes (converter, screen edges, …) |
| [`CR/APP_SPEC.md`](CR/APP_SPEC.md) | Single source of truth: features, architecture, data and sync, privacy, licensing, milestones, decisions |
| [`CR/DEVLOG.md`](CR/DEVLOG.md) | What each work session did, newest first |
| [`CR/PIPELINE.md`](CR/PIPELINE.md) | Branch to users: build loop, review, merge, release, hotfix, update feed, the owner's one-time setup |
| [`CHANGELOG.md`](CHANGELOG.md) | `## Next` is the owner's intent; each section is a release (also shown in the app's What's new page) |
| [`CLAUDE.md`](CLAUDE.md) | Rules and commands for Claude Code |
| [`AGENTS.md`](AGENTS.md) | Starting point for any other AI agent (Antigravity, Codex, Cursor, …) |
| [`.claude/skills/steward/SKILL.md`](.claude/skills/steward/SKILL.md) | Step by step: build-test loop → PR → approval → merge → release |
| [`.github/pull_request_template.md`](.github/pull_request_template.md) | Checklist every pull request fills in |
| [`scripts/win/README.md`](scripts/win/README.md) | The Windows `.bat` commands |
| [`services/pocketbase/README.md`](services/pocketbase/README.md) | The backend: running, deploying, free 24/7 hosting |
