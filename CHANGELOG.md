# Changelog

What changed for people using MouseComb, per release. Versions are `x.y.z+b` ([VERSIONING.md](VERSIONING.md)); `0.y.z` releases are prototypes. Adding a new version section here and pushing it publishes that release.

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
