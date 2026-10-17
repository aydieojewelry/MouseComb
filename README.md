# MouseComb

A Windows desktop companion that turns **CapsLock into a Hyper-Key** and adds **safe mouse gestures**, **hot screen edges** and a small **AMOLED HUD** (clock, Pomodoro, weather). Built with Tauri v2 + Rust. A mobile companion is planned.

> **Status:** pre-production, planning done, scaffolding next (build B-0001). Nothing to install yet.

| Feature | Trigger |
|---|---|
| Hyper-Key | hold `CapsLock` (hold alone 1.5 s = real CapsLock) |
| Help | `Caps+/` · detailed `Caps+Shift+/` |
| OmniBar launcher | `Caps+Space` |
| Clipboard & snippets | `Caps+V` |
| Mouse gestures | `Caps` + left-drag (right-drag optional) |
| Hot edges & corners | scroll or rest at a screen edge, set up visually in Settings |
| HUD | bottom-right; fades as the mouse approaches, hold `Ctrl` to use it |
| Pause everything | `Caps+Pause` or the tray menu |

## Docs
- [`APP_SPEC.md`](APP_SPEC.md): what we're building, architecture, config, milestones (single source of truth)
- [`DEVLOG.md`](DEVLOG.md): manual build log until 1.0
- [`CLAUDE.md`](CLAUDE.md): rules for AI agents
