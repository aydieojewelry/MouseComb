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
