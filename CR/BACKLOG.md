---
tags: [mousecomb, backlog, ideas]
aliases: [Backlog, Later]
status: active
updated: 2026-10-21
---

# Backlog

Ideas that are **not** planned yet, most useful first. To start one, say `>plan <name>`: it becomes bullets under `## Next` in [[CHANGELOG]] and waits for your go. Settled facts live in [[APP_SPEC]]; how we work is in [[META-RULES]].

| # | Idea | Size | Needs |
|---|---|---|---|
| 1 | [[#Converter in the OmniBar]] | medium | the grammar below; no OS code |
| 2 | [[#Screen edges and corners]] (FEAT-007) | medium | the mouse hook from FEAT-006 |
| 3 | [[#Input polish]] | small each | Windows test results first |
| 4 | [[#OmniBar extras]] | small each | |
| 5 | [[#Platforms]] | large | per-platform input adapters |
| 6 | [[#Product and operations]] | large | owner decisions |

## Converter in the OmniBar
#idea
Currency and everyday units from **one text box** (the OmniBar), inspired by the owner's earlier *Tauri Calc*. **Trade-specific units are out** (decided by the owner); only currency and common units.

**What you type → what you see**

| Type | Result |
|---|---|
| `10usd pkr` | 10 USD in PKR |
| `100pkr to gbp` | 100 PKR in GBP |
| `50gbp > pkr` | 50 GBP in PKR |
| `$20` | 20 USD (a bare `$` means USD) |
| `12usd + 300pkr` | a mixed sum, answered **in every currency used, in order of first appearance** |
| `5 km to mi`, `70 f to c`, `2 gb to mb` | everyday units: length, mass, volume, temperature, area, speed, time, data size |

**How it should work**
- A pure parser in `apps/desktop/src/omnibar/` (like `calc.ts`), tested with the table above; the calculator keeps working for plain sums.
- Rates from `https://open.er-api.com/v6/latest/{BASE}`, fetched **in Rust** (not the page) and cached for 12 hours in the store; offline uses the last cache and says how old it is. New action `core.os.convert` or a command on the existing quick-commands path (FEAT-023).
- **Enter copies the result row** (one text box, no currency-picker dialog). A row per currency for mixed sums; the first row is the one you asked for.
- Currency codes: ISO 4217, case-insensitive; say "unknown currency" rather than guessing.

## Screen edges and corners
#idea
FEAT-007. Spec and defaults in [[APP_SPEC]] (§7): 4 edges and 4 corners per monitor, outer edges only; scroll-up, scroll-down and dwell triggers; edge 2 px, corner 8×8 px, dwell 350 ms, cooldown 600 ms; all corners off by default; ships **off** like every hook (DEC-025).
- Build on `mc-win` hooks (mouse position is already tracked for gestures); pure zone and dwell logic in `mc-core::input` with tests first.
- New trigger kinds `edge:left:scroll_up` and `corner:top_left:dwell` in `Trigger`; the Bindings editor gets a zone picker with a small monitor preview.
- Needs a Windows test with two monitors (inner borders must not trigger).

## Input polish
#idea
- Tray toggle for hotkeys and gestures (the panic key already exists).
- Hotkeys with `only_in` / `not_in` pass the key through in other apps: needs resolving in the hook, not `RegisterHotKey`.
- Conflict warnings against reserved and well-known Windows shortcuts (`Ctrl+Alt+Del`, `Win+L` can't be bound).
- LMB + scroll chord (FEAT-011), per-app gesture sets, a gesture trail overlay, export and import of bindings.
- Hotkey cheat-sheet from the live bindings (FEAT-009).

## OmniBar extras
#idea
- `Caps+Space` as a second opener once Hyper-Key is proven.
- Show each result's current hotkey; extension commands open views inside the OmniBar.
- Import the full DuckDuckGo bang list as an optional download; keep the built-in 60 as the offline default.
- Clipboard history (FEAT-005a), weather widget (FEAT-003), snippet expansion from typed trigger text.

## Platforms
#idea
- **Linux input:** gestures and Hyper-Key need their own adapter (evdev or the desktop's portals); hotkeys work on X11 only today, Wayland needs the GlobalShortcuts portal (DEC-024).
- **macOS:** its own input adapter; everything else is shared.
- **Mobile (FEAT-012, M10):** Tauri v2 mobile reusing `packages/ui`, `packages/data` and the Rust core; no global input there.

## Product and operations
#idea
- Windows code signing before 1.0 (DEC-020); crash reports; staged rollout gated on health (FEAT-027).
- Telemetry and the Insights add-on (FEAT-024, FEAT-026, M2).
- Workflows (FEAT-015), extension host, SDK and library (FEAT-016, FEAT-017).
- Pro edition: licensing, purchase, end-to-end encryption, QR pairing (M8; DEC-009, DEC-013, DEC-014).
- A design mock of the Bindings page on the design canvas (the page was built from the tokens without one).
