# MouseComb

A Windows companion that lets you bind **any key, gesture or screen edge** to **any Windows command, setting or workflow**, then add more with **free extensions**. Your setup syncs, end-to-end encrypted, to your other PCs and to the MouseComb phone app.

> **Status:** pre-production, planning done, scaffolding next (build B-0003). Nothing to install yet.

## How it works
**Trigger → Binding → Action.** Everything MouseComb does is an action: native Windows commands, every setting, extension commands and your own workflows. Any trigger can run any of them, optionally only in certain apps.

| Part | What it is |
|---|---|
| Core shell | Triggers, bindings, native Windows actions, workflows, OmniBar, Settings, extension host |
| Bundled extensions | Clock, Pomodoro, Weather, Clipboard, Snippets (removable) |
| Extension library | Free, open-source, one-click install, permission-checked |
| Sync + phone app | Bindings, workflows, snippets and settings on every device (Pro) |

## Tech stack
Tauri v2 + Rust core · React 19 + TypeScript · Ark UI (Zag.js) · TanStack Router / DB / Query / Table / Virtual / Form / Pacer · Tailwind v4 · SQLite · QuickJS for extensions.

| Default | Trigger |
|---|---|
| OmniBar (run anything) | `Caps+Space` |
| Clipboard & snippets | `Caps+V` |
| Help | `Caps+/` · detailed `Caps+Shift+/` |
| Mouse gestures | `Caps` + left-drag (right-drag optional) |
| Hot edges & corners | scroll or rest at a screen edge |
| Pause everything | `Caps+Pause` |

## Editions
**Free** forever: everything on one PC, including extensions and workflows. **Pro**: cloud sync, full phone app, schedule and system-event triggers.

## Docs
- [`APP_SPEC.md`](APP_SPEC.md): what we're building, architecture, data & sync, licensing, milestones (single source of truth)
- [`DEVLOG.md`](DEVLOG.md): manual build log until 1.0
- [`CLAUDE.md`](CLAUDE.md): rules for AI agents
