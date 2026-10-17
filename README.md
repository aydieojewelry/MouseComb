# MouseComb

A Windows companion that lets you bind **any key, gesture or screen edge** to **any Windows command, setting or workflow**, then add more with **free extensions**. It has a CapsLock Hyper-Key, safe mouse gestures, hot edges, a command palette (OmniBar) and a small AMOLED HUD. Built with Tauri v2 + Rust. A mobile companion is planned.

> **Status:** pre-production, planning done, scaffolding next (build B-0002). Nothing to install yet.

## How it works
**Trigger → Binding → Action.** Everything MouseComb does is an action: native Windows commands, every MouseComb setting, extension commands and your own workflows. Every trigger can run any of them, optionally only in certain apps.

| Part | What it is |
|---|---|
| Core shell | Triggers, bindings, native Windows actions, workflows, OmniBar, Settings, extension host |
| Bundled extensions | Clock, Pomodoro, Weather, Clipboard, Snippets (removable) |
| Extension library | Free, open-source, one-click install, permission-checked |

| Default | Trigger |
|---|---|
| OmniBar (run anything) | `Caps+Space` |
| Clipboard & snippets | `Caps+V` |
| Help | `Caps+/` · detailed `Caps+Shift+/` |
| Mouse gestures | `Caps` + left-drag (right-drag optional) |
| Hot edges & corners | scroll or rest at a screen edge |
| Pause everything | `Caps+Pause` |

## Docs
- [`APP_SPEC.md`](APP_SPEC.md): what we're building, architecture, extension API, milestones (single source of truth)
- [`DEVLOG.md`](DEVLOG.md): manual build log until 1.0
- [`CLAUDE.md`](CLAUDE.md): rules for AI agents
