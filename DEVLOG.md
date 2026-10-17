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

## B-0007 — 2026-10-17 — M1 built: OmniBar, Clock HUD, Pomodoro, first launch, auto-updates
- Owner decisions: the repo is public (DEC-019: releases from this repo), keep **Use offline** (DEC-017), usage sharing **on by default** with a switch (DEC-018).
- Done:
  - **OmniBar (FEAT-004, FEAT-023):** own window on a global shortcut (`Alt+Space`, recordable in Settings); `CommandPalette` (Ark Combobox + TanStack Virtual) in `packages/ui`; ranking with recents; calculator (no `eval`), web addresses, web search, installed apps (`Get-StartApps`, DEC-023), snippet copy with tokens, 8 Windows Settings pages, lock/sleep/sign out/restart/shut down with a confirm step, every Settings page, Sync now, updates, Pomodoro.
  - **Actions (FEAT-013, M1 part):** `mc_core::actions` catalog + ids; one Rust runner (`action_run`) used by the OmniBar and the tray, with allow-lists and confirmation enforced in Rust.
  - **Clock HUD (FEAT-001):** transparent click-through window bottom-right; proximity fade from Rust (cursor polled only while visible); Pomodoro countdown; action flashes. `hud.enabled` toggle.
  - **Pomodoro (FEAT-002):** pure timer in `mc_core::pomodoro`; ticker, notifications, saved state, synced `pomodoro` sessions; Settings page with ring, controls, stats and durations; tray item.
  - **First launch (FEAT-021):** Welcome page with sign-in / create account / Use offline, start-with-Windows and usage-sharing switches; password reset (`Backend::request_password_reset`).
  - **Updates (FEAT-022):** updater plugin with status, background download, install on restart or quit; release workflow writes the public key and makes `latest.json` prefer NSIS. Off in builds without the key.
  - New crate `mc-win` (apps, power). Routes code-split per window. Tray: OmniBar, Pomodoro, clock, updates.
- Verified:
  - `cargo test --workspace` with live PocketBase: 36 tests (new: Pomodoro machine, catalog, snippet tokens, prefs, fade math, version text, Start-apps parser, password reset). Clippy `-D warnings` clean; Windows cross-check passes.
  - Vitest 14 (calculator, ranking, recents), typecheck, production build; actionlint.
  - Real app on Linux (Xvfb + xdotool): first launch opens Welcome; `Alt+Space` opens the OmniBar; "timer" + Enter starts Pomodoro and the HUD counts down; a sum shows "Copied" on the HUD; "about" opens Settings → About; a 1-minute focus phase ended, logged a `pomodoro` item and moved to a waiting break.
  - Fixed during the run: HUD click-through before showing crashed on Linux; HUD placed before its size was known; OmniBar hid itself on a focus bounce (400 ms grace); the "open page" event navigated the HUD window too; a resting mouse stole the OmniBar highlight.
- Not verified: anything on real Windows (Start apps list, power actions, Acrylic look, toasts, the NSIS update cycle). The first signed release needs the owner's setup (PIPELINE.md).
- Next: owner setup → first release `0.1.0.0+b` → install on a clean Windows PC (M1 exit check) → M2.

## B-0006 — 2026-10-17 — Delivery pipeline for AI agents; Insights add-on planned
- Done:
  - `PIPELINE.md`: the loop plan → agent build-test loop → PR + CI → owner approval → squash merge → gated weekly release → auto-update → Insights → plan, with a diagram and the owner's one-time GitHub setup.
  - `.claude/skills/steward/SKILL.md`: the procedure agents follow (commands, commit prefixes, PR, CI fix loop, when to stop and ask). `AGENTS.md` points other agents (Antigravity, Codex, Cursor) to the same rules.
  - CI (`.github/workflows/ci.yml`): Rust fmt/clippy/tests against a live PocketBase + bindings drift check, Go vet/build, frontend types/tests/build + script tests, Windows build. Release (`release.yml`): weekly + manual, picks the version from commits, waits for owner approval on the `release` environment, builds and publishes with tauri-action; off until `RELEASES_ENABLED=true`.
  - `scripts/version.mjs` (+ 6 tests): next `w.x.y.z+b` from commit prefixes, installer form `w.x.(y·100+z)`, release notes, stamping manifests. About page now shows `w.x.y.z+b`.
  - `.github/CODEOWNERS`, PR template. Spec: FEAT-026 Insights add-on (subproject, basic ML), FEAT-027 staged rollout, FEAT-028 pipeline; DEC-021/022.
- Verified: workflows pass actionlint; version tests pass; `apply` stamps all three manifests; clippy `-D warnings` clean; the three Mermaid diagrams render.
- Not verified: the workflows haven't run on GitHub yet (first run happens on the next push/PR); branch protection and the `release` environment must be set up by the owner (PIPELINE.md, "One-time setup").
- Next: owner setup on GitHub; then build M1.

## B-0005 — 2026-10-17 — Roadmap reshaped; versioning format
- Done:
  - **M1 redefined** as the first installable release, complete in itself: installer, weekly auto-updates, sign-in page, OmniBar (global hotkey) that opens Settings and runs quick commands, Clock HUD, Pomodoro. Engine work (Hyper-Key, actions, bindings) moves to M3; milestones now M0–M10, production 1.0 at M9.
  - **M2 defined:** opt-in usage telemetry with a weekly aggregate report in the repo for AI agents to plan from, plus release automation.
  - **`VERSIONING.md`:** format `w.x.y.z+b` (major schematic uplift, feature, patch, fix, build), commit-prefix rules, mapping to the SemVer/MSI forms installers need, trunk-based branching and weekly release train as git graphs.
  - README lists every human-readable file; new decisions DEC-016…020 (OmniBar hotkey, sign-in, telemetry consent, release hosting, code signing).
- Files: `APP_SPEC.md`, `VERSIONING.md`, `README.md`, `CLAUDE.md`, `DEVLOG.md`
- Blockers / decisions: DEC-017 (sign-in required?), DEC-018 (telemetry consent), DEC-019 (is the repo private?).
- Next: build M1.

## B-0004 — 2026-10-17 — First code: app shell, PocketBase backend, sync
- Done:
  - **Backend (DEC-010 → PocketBase):** `services/pocketbase`, PocketBase v0.40.4 embedded in Go. Collections `users`, `items` (every synced record, told apart by `kind`), `devices`; owner-only API rules; server hook rejects older writes (409) and owner/kind/key changes; sign-in rate limits on. Deploy notes for free 24/7 hosting.
  - **Rust:** Cargo workspace. `mc-core` (Item model, last-writer-wins merge, stable record ids), `mc-store` (SQLite, dirty tracking, tombstones, device id, device-only settings), `mc-sync` (`Backend` trait, PocketBase adapter with 429 retry and friendly errors, keyset-paged pull + push).
  - **Desktop shell (Tauri 2.12):** tray menu, single instance, start with Windows (`--minimized`), close-to-tray, session in Windows Credential Manager, background sync (start, after changes, every 60 s, Sync now), daily token refresh. 15 typed commands + 3 events exported to `packages/bindings` with tauri-specta.
  - **React:** `packages/ui` (tokens as Tailwind v4 theme, Ark UI Button/TextField/TextArea/Switch/Slider/Dialog/Toaster, in-house icons), `packages/data` (TanStack DB collections over Rust items, Query hooks for account and sync, mock backend for tests and browser preview), `apps/desktop` (TanStack Router: General with live HUD preview, Snippets with virtualized list + TanStack Form editor, Account & sync, About).
  - pnpm only installs package versions at least 14 days old (`minimumReleaseAge`).
- Verified:
  - `cargo test --workspace`: 20 tests, including 4 against a live PocketBase (two devices, concurrent edits, stale writes, account isolation, auth errors). Clippy clean. `go vet` clean.
  - Vitest: 6 tests. `tsc` clean. Production build has no mock code.
  - Real app on Linux (WebKitGTK, Xvfb) driven with xdotool: offline snippet uploaded on sign-in, device registered, remote snippet + extension setting arrived after Sync now.
  - `cargo check --target x86_64-pc-windows-gnu` passes (tray, Credential Manager code).
- Not verified: running on real Windows (WebView2, tray, Credential Manager, autostart).
- Workarounds: specta-typescript 0.0.12 loops on recursive `serde_json::Value`, so JSON fields export as `unknown` (validated with Zod in the UI). Fluent icon package dropped for size.
- Decision after review: DEC-007, window actions removed entirely (catalog group and the `windows` extension permission are gone).
- Next: first run on Windows; then **M1** (hook thread, Hyper-Key, action registry, bindings).

## B-0003 — 2026-10-17 — React + Ark/Zag + TanStack, sync, Pro edition
- Done:
  - UI framework switched from Svelte to **React 19** (DEC-001). Components: **Ark UI** (Zag.js state machines), raw `@zag-js/*` for custom widgets, Tailwind v4 tokens, Fluent icons.
  - TanStack mapped to jobs (§4): Router (one route per window), **DB** (live collections backed by the Rust store via typed Tauri events/commands), Query, Table, Virtual, Form + Zod 4, Pacer.
  - Shell decision DEC-008: Tauri v2 + official plugins, with a native feel (Mica/Acrylic, native tray, toasts) rather than a WinUI 3 shell.
  - New FEAT-020 data & sync: SQLite store on every device, end-to-end encrypted last-writer-wins sync, QR pairing, phone → desktop "Allow from phone" workflow requests.
  - New FEAT-019 product & licensing: Free + Pro editions, merchant of record, signed offline-verifiable license tokens, code-signed installer, updater.
  - Monorepo layout: `apps/desktop`, `apps/mobile`, `packages/{ui,data,bindings,api}`, `crates/{mc-core,mc-store,mc-sync,mc-license,mc-win,mc-ext}`, `services/sync`.
  - Milestones now M0–M9 (1.0 at M8, mobile at M9).
- Files: `APP_SPEC.md`, `DEVLOG.md`, `CLAUDE.md`, `README.md`
- Blockers / decisions: DEC-009 (pricing), DEC-011 (mobile framework), DEC-013 (merchant of record) need the owner.
- Next: **M0** monorepo scaffold.

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
