# Changelog

What changed for people using MouseComb, per release. Versions are `x.y.z+b` ([CR/CR.md](CR/CR.md#versioning)); `0.y.z` releases are prototypes.

**How this file works.** Under `## Next` the owner writes what they want next, as bullets. An agent builds it and files each bullet under a sub-heading (Features, Functionality, Hotkeys, Core ideas, Changes, Fixes, Known limits); `node scripts/version.mjs release` then turns `## Next` into the numbered section and picks the version. A numbered section reaching `main` publishes that release. The What's new page in the app shows these sections.

## Next

<!-- Owner: write what you want next as bullets here, under any sub-heading (Features, Functionality, Hotkeys, Core ideas, Changes, Fixes). Agent: build it, then keep these sub-headings and run `node scripts/version.mjs release`. -->

## 0.1.0+2 — 2026-10-21 — hotkeys, gestures, snippet typing, bangs

Everything since 0.0.0+1.

### Features
- **Hotkeys you assign:** Settings → Bindings → *New binding*. Press the keys, then pick what they do: any OmniBar command, a snippet, volume, media keys, switch desktop, send keys.
- **Mouse gestures** (Windows): hold `CapsLock` and drag left, right, up or down to run an action. Right-button drag is available too, off by default.
- **Snippet typing:** have a snippet typed into any app without touching your clipboard, from a binding or from the OmniBar (*Type “…”*).
- **Bangs in the OmniBar:** `!yt cats` or `cats !yt` searches that site. About 60 are built in, you can add your own in Settings → General → Bangs, and any other bang goes to DuckDuckGo.
- **What's new page:** what changed in each version, in the sidebar. It opens by itself once after an update.

### Functionality
- New things a binding can do: send a key combination, volume up, down and mute, play/pause, next and previous track, next and previous desktop, turn hotkeys on or off.
- Updates: installed copies read their update feed from a fixed place, so they find new versions even though every prototype is a pre-release.
- Settings → About points to What's new instead of a fixed list.

### Hotkeys
- **`Ctrl+Alt+Pause`** turns hotkeys, Hyper-Key and gestures off at once, and stops anything being typed.
- **CapsLock Hyper-Key:** hold `CapsLock` and press a key to run its binding. Holding `CapsLock` alone for 1.5 seconds toggles real CapsLock.

### Core ideas
- Everything is an **action**, and a **binding** connects a trigger (hotkey, CapsLock key, gesture) to one. Bindings sync across your PCs.
- Hotkeys, Hyper-Key and gestures start **off**, behind one switch in Settings → Bindings, and the panic key always works.
- The input engine never leaves a key held down, ignores what MouseComb types itself, and does nothing slow inside the keyboard and mouse hooks.
- Version numbers now come from this file, and releases are built only from `main`.

### Known limits
- Hotkeys, Hyper-Key and gestures haven't been run on a real Windows PC yet: please try them and report back. Start with the switch in Settings → Bindings.
- A hotkey limited to certain programs still takes the key in every program.
- Linux: hotkeys work on X11 only; Hyper-Key, gestures and typing snippets are Windows-only for now (Linux copies the snippet and says to press `Ctrl+V`).
- Updating itself needs the one-time signing setup; until then, install each new version over the old one.
- The installers aren't code-signed yet, so Windows SmartScreen may warn: **More info → Run anyway**.

## 0.0.0+1 — 2026-10-20 — first build

The first numbered build of MouseComb, for **Windows 10/11** and **Linux**: everything in the 0.1.0+11 prototype below, plus this fix.

### Fixed
- **Windows: the main window showed "Something went wrong!"** on start while the clock worked. Windows opened the window before MouseComb had finished starting, so its first request failed. Windows are now created only once MouseComb is ready, and if a page ever fails to load it says why and offers **Try again**.

### Known limits
- No server is set up yet: choose **Use offline** on the first screen, or point Account & sync at your own server.
- This build doesn't update itself; install the next one over it. If 0.1.0+11 is installed, this one replaces it.
- The installers aren't code-signed yet, so Windows SmartScreen may warn: **More info → Run anyway**.
- Linux: the installed-apps list and power commands are Windows-only for now, and the `Alt+Space` shortcut needs an X11 session (not Wayland).

## 0.1.0+11 — 2026-10-20 — first prototype

The first build you can install, for **Windows 10/11** and **Linux**. It's a prototype: try it and tell us what works and what doesn't. Later versions may change things.

### New
- **OmniBar** (`Alt+Space`, changeable): find and open apps, MouseComb commands and Settings pages, snippets, Windows Settings pages, web addresses and web searches; a calculator (`200 * 15%`); lock, sleep, sign out, restart and shut down (with a second Enter to confirm).
- **Pomodoro timer in the OmniBar:** type "timer". A dial shows the time left; see what comes next; +5 min, Skip, Reset; `Space`, `S`, `R`, `+` and `Esc` work from the keyboard.
- **Clock on screen** in the bottom-right corner that fades away as your mouse gets close. Pick an analog face (Minimal, Classic, Sport, Orbit) or a digital one (Stacked, Bold, Pill, LCD). It shows the Pomodoro countdown too.
- **Pomodoro:** focus sessions and breaks with notifications, lengths you set, a long break after the number of sessions you pick, and your sessions today and this week.
- **Snippets:** text you copy in one step, with `{DATE}`, `{TIME}`, `{USER}` and `{CLIPBOARD}` filled in.
- **Settings** that save as you change them: shortcut, search engine, clock face with a live preview, fade distance, start with Windows, usage sharing.
- **Account and sync** (optional): sign in to keep settings and snippets the same on every PC, or pick **Use offline**.

### Known limits
- No server is set up for this prototype yet: choose **Use offline** on the first screen, or point Account & sync at your own server.
- Updates: this prototype doesn't update itself; install the next version over it.
- The installers aren't code-signed yet, so Windows SmartScreen may warn: **More info → Run anyway**.
- Linux: the installed-apps list and power commands are Windows-only for now, and the `Alt+Space` shortcut needs an X11 session (not Wayland).
