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

## 0.0.0+1 — 2026-10-20 — Windows start-up fix; numbering restarts at 0.0.0+1
- Owner report (0.1.0+11 on Windows): the main window showed "Something went wrong!" with an empty message while the clock worked.
- Cause: Tauri creates the windows from tauri.conf.json before the setup hook runs, and WebView2 loads fast enough that the main window's first commands (`local_setting_get`, `account_get` in the `/` route's `beforeLoad`) arrived before `app.manage(AppState)`. Tauri rejects those with a plain string, so `AppError` had no message, and queries don't retry, so the error stayed. The HUD only uses live collections, which recover on the next event.
- Fix: windows are `"create": false` and built in setup right after the state is managed (the main window starts hidden with `--minimized`); `AppError`/`errorMessage` turn untyped rejections into readable errors (+ tests); a router `ErrorPage` with **Try again**.
- Verified: fresh profile in Xvfb opens on Welcome with the HUD and OmniBar working; tests, typecheck, clippy.
- Owner decision: numbered builds start at **v0.0.0+1** (VERSIONING.md); the earlier 0.1.0+11 prototype stays published until the owner says otherwise.

## 0.1.0+11 — 2026-10-20 — First prototype release; versions are x.y.z+b
- Owner decisions: publish a prototype now; versions are **`x.y.z+b`** (main feature, minor change, fix/patch, build) instead of `w.x.y.z+b`.
- Done: `scripts/version.mjs` (+ tests) for `x.y.z+b` (installers use `x.y.z` as is, `0.y.z` is a pre-release, the build grows by one per release including hotfix rebuilds); VERSIONING.md rewritten; the app shows `x.y.z+b`; the Release workflow also releases the newest `CHANGELOG.md` version when a push adds it (prototypes from any branch, 1.0+ from `main` only; this session can't push tags) or on a pushed tag `vX.Y.Z+B`, with that version's section as notes (`version.mjs plan`, tested) and ships without self-update until the updater key is set up; `CHANGELOG.md` added; spec, PIPELINE, README, CLAUDE.md updated. Bundle targets `all` (Windows: NSIS + MSI, Linux: AppImage + .deb + .rpm).
- Released: `v0.1.0+11`, built, tagged and published by the Release workflow as a GitHub pre-release.
- Next: owner tries both installers; owner setup (PIPELINE.md) for signed self-updates and a hosted server.

## B-0010 — 2026-10-20 — Linux as a production target; installers in CI; PR
- Owner decision: ship for Windows **and Linux** (DEC-024).
- Done: Linux bundles (AppImage, .deb, .rpm with their library dependencies) next to NSIS and MSI in `tauri.conf.json`; CI job "Installers" builds unsigned test installers on Windows and Ubuntu 22.04 for every pull request and keeps them as run artifacts for 14 days; the release workflow creates one draft release, builds and signs both platforms in parallel into it (one `latest.json`), then publishes it. PIPELINE.md, README and APP_SPEC (targets, FEAT-022, DEC-024) updated.
- Verified: `tauri build` on Linux made the .deb (18 MB), .rpm (18 MB) and AppImage (92 MB); the release binary started in Xvfb with Settings, the analog HUD and the OmniBar timer working; actionlint clean. Windows installers are built by CI (not buildable in this Linux container).
- Not on Linux yet (DEC-024): installed-apps list, power commands, Wayland global shortcut.
- Next: owner setup (PIPELINE.md) → first release → try both installers.

## B-0009 — 2026-10-19 — The approved design: OmniBar timer, clock faces, simpler Settings
- Owner approved the design canvas (https://claude.ai/artifact/6TCLQibXwK8SiFGxzhBcJ3) after three rounds of comments: a dial timer inside the OmniBar, cards still to come blurred, finer dial markings, analog/digital clock faces, simpler and more visual Settings.
- Done:
  - **OmniBar Pomodoro timer view (FEAT-002, FEAT-004):** "Pomodoro timer" (`mc.omnibar.open` with `view: pomodoro`) opens a dial view: time left on a 60-minute dial (minute ticks, half-minute dots, quarter numbers, inner arc), raised start/pause in the middle, countdown, Now / Next / After N cards (later ones blurred), +5 min / Skip / Reset; `Space` `S` `R` `+` keys, `Esc` back. The OmniBar now closes itself after a list command (`omnibar_hide`), so the view's buttons keep it open.
  - **New action `ext.mc.pomodoro.extend`** (`Pomodoro::extend`, +5 min by default, up to 3 h left; the phase keeps its length when durations change) and the catalog entry "Add 5 minutes to Pomodoro".
  - **Clock faces (FEAT-001):** `hud.style` analog/digital with `hud.dial_face` (Minimal, Classic, Sport, Orbit) and `hud.digital_face` (Stacked, Bold, Pill, LCD); the status line (Pomodoro, flashes) sits above the face. Rust sizes the HUD window per style (160×90 / 128×128) and re-places it when the style changes.
  - **Settings · General:** big keycap shortcut with Change, search engine chips (DuckDuckGo / Google / Bing / Custom…), Clock card (on/off, Analog/Digital, face cards with live previews, corner preview with fade zones, Close/Medium/Far presets, seconds), Basics (start with Windows, usage sharing with "What's shared"). The CapsLock and Weather sections are gone until those features ship (M3, M5); their settings stay defined.
  - **Settings · Pomodoro:** the dial with start/pause, Skip, Reset, two stat tiles; "Your rhythm" −/+ steppers (typeable), long break after 2–6, auto-start.
  - **UI kit (`packages/ui`):** `TimerDial`, `ClockFace` (+ `clockParts`, `handAngles`), `ChoiceGroup` (Ark RadioGroup: segment, chip, circle, card), `Stepper` (Ark NumberInput), `RoundButton`, `useShortcutRecorder`, large `Kbd`, `Switch hideLabel`, `Section` without a title; tokens `card`, `face`, `button`, `selected`, `tick`.
- Verified: clippy `-D warnings` (Linux and Windows target), fmt, 38 Rust tests with live PocketBase, 25 Vitest + 6 script tests, typecheck, production build, bindings regenerated; browser preview of every new screen; real app in Xvfb: "timer" + Enter opens the dial view, Space starts, `+` adds 5 min, Esc back then Esc closes; switching to Analog in Settings resizes and re-places the HUD with the countdown above the face.
- Found: on Linux a webview window is never smaller than 200×200, so the HUD page now draws in a box of its intended size at the top-left (Windows gets the exact size).
- Next: owner setup → first release → Windows run (check the HUD sizes and faces at 100 % and 150 % scaling).

## B-0008 — 2026-10-19 — Simpler, lighter M1 code; editable design canvas
- Done:
  - **Design:** an editable Claude Design canvas with the OmniBar (Typing / Calculator / Confirm states), Clock HUD, tokens, First launch, Settings · General and Settings · Pomodoro, with accent-color tweaks: https://claude.ai/artifact/6TCLQibXwK8SiFGxzhBcJ3
  - **Code review pass (reuse, simplification, efficiency, altitude), behavior kept:**
    - Rust: action catalog built once (`LazyLock`) with `needs_confirmation`/`is_web_url` helpers; Pomodoro `running` derived from `ends_at`; one `now_ms`; settings read with one query and reloads batched (50 ms); toggle defaults and setting lookup in `prefs`; tray runs every item through actions and only updates menu text that changed; `quit` simplified.
    - Idle costs: the Pomodoro task sleeps while stopped (was 2 wake-ups/s), the HUD fade loop sleeps while hidden and reads only the cursor per tick (was 5 blocking window calls per tick), clipboard read only for `{CLIPBOARD}` snippets, app scan 30 s after start and every 15 min instead of at sign-in and every 5 min.
    - HUD placed from its configured size, so the 400 ms "place again" retry is gone; the page draws from the top edge.
    - TS: `useBackendEvent` hook (window-scoped option) replaces four hand-written subscriptions and the `dataset.window` guard; shared `accountQuery`, `useNow`, `issueText`, `ShortcutKeys`, `pomodoroVerb`/`isRunning`; HUD re-renders once a minute unless something per-second is shown.
- Verified: clippy `-D warnings` (Linux and Windows target), 36 Rust tests, 14 Vitest + 6 script tests, typecheck, build; real app in Xvfb: HUD placed correctly at once, OmniBar "about" opens About while the HUD stays a clock, "timer" starts Pomodoro with flash + countdown.
- Skipped (noted): per-key local-setting invalidation (needs a store API change), keeping the downloaded update on disk instead of in memory, a stats query for Pomodoro sessions, generating TS setting defaults from Rust.
- Next: owner setup → first release → Windows run.

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
