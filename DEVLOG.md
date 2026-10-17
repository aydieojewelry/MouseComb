# MouseComb — Dev Log (pre-production)

Manual build log until production 1.0 (see `APP_SPEC.md` §8). Newest entry on top.
Template:

```
## B-000N — YYYY-MM-DD — <title>
- Done:
- Files:
- Blockers / decisions:
- Next:
```

---

## B-0002 — 2026-10-17 — Extension platform re-architecture
- Done:
  - MouseComb is now a platform: **triggers → bindings → actions**. Any hotkey, Hyper-key combo, key sequence, gesture, edge or chord can be bound to any action or workflow, optionally per app.
  - New core features: action registry with a native Windows catalog and auto-generated `setting.*` actions (FEAT-013), binding system (FEAT-014), workflows (FEAT-015), extension host + SDK + permissions (FEAT-016), free extension library (FEAT-017), script commands (FEAT-018).
  - Moved clock, pomodoro, weather, clipboard and snippets out of core into **bundled extensions** built on the public API. The HUD is now a widget host.
  - Added a safety model (§6) and new config files (`bindings.json`, `workflows/`). Milestones re-ordered M0–M8.
  - New decisions DEC-005 (QuickJS/TypeScript runtime), DEC-006 (GitHub-hosted library), DEC-007 (window actions in catalog, unbound).
- Files: `APP_SPEC.md`, `DEVLOG.md`, `CLAUDE.md`, `README.md`
- Blockers / decisions: DEC-005 and DEC-007 need a yes from the owner.
- Next: **M0** scaffold, now including `crates/mc-ext`, `sdk/` and `extensions/` folders.

## B-0001 — 2026-10-17 — Clean repo + Tauri re-plan
- Done:
  - Replaced the AutoHotkey v2 prototype and the abandoned Flutter launcher with a **Tauri v2 + Rust** plan, with a mobile companion to follow.
  - Rewrote `APP_SPEC.md` as a lean single source of truth: removed dead references (Obsidian vault, `legacy/` folder), moved the session log here.
  - Gestures redesigned around safe triggers: Caps+LMB drag on by default, RMB-drag opt-in with click replay, Ctrl+Shift+drag rejected. Middle-button gestures and window management (`Caps+P/M/G`) dropped.
  - Hot edges now come with a visual Settings window (FEAT-010) that has a live monitor map and an on-screen zone overlay.
  - LMB+scroll chord kept but off by default (conflicts with selecting text while scrolling).
- Files: `APP_SPEC.md`, `DEVLOG.md`, `CLAUDE.md`, `README.md`
- Blockers / decisions: DEC-001…004 in `APP_SPEC.md` §9.
- Next: **M0** — scaffold the Tauri workspace (`app/`, `src-tauri/`, `crates/mc-core`, `crates/mc-win`), tray, config load/save.

### Prototype history (AutoHotkey, Sep 2026, not in this repo)
- AHK v2 build had a verified HUD clock/fade, stopwatch and Karachi weather. OmniBar and clipboard were in progress, gestures were in testing (RMB threshold 18 px), hot edges were never ported.
- A Flutter Windows launcher was started (Sep 18) and is now superseded by Tauri.
