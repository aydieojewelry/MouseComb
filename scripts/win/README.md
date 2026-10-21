---
tags: [mousecomb, windows, commands]
aliases: [Windows commands, bat files]
---

# Windows commands (`scripts\win`)

Double-click a file, or type its name in `cmd` or PowerShell from any folder. Each one finds the repo by itself, checks that the tools it needs are installed and says what is missing. They are plain `.bat` files: no PowerShell policy to change, nothing to install for them.

| Run | What it does | When |
|---|---|---|
| `setup.bat` | Checks Node, pnpm, Rust and Go, then `pnpm install` | Once, and after pulling |
| `dev.bat` | The UI in your browser with example data, http://localhost:1420 | Looking at or editing screens |
| `backend.bat` | The PocketBase backend, http://127.0.0.1:8090 (admin at `/_/`) | Before `app.bat`, to try sync |
| `app.bat` | The real app (Tauri) with live reload | Trying hotkeys, gestures, the clock |
| `tunnel.bat [port]` | A public `trycloudflare.com` address for the backend (or another port) | Using your PC's backend from a phone or another PC |
| `check.bat` | Everything CI checks: format, lint, tests, types, docs, build | Before you push |
| `build.bat` | Installers on this PC, in `target\release\bundle` | Testing an installer without waiting for GitHub |
| `bindings.bat` | Regenerates the typed Rust to TypeScript client | After a Tauri command or event changed |
| `release-next.bat` | What the next release would be, from `## Next` in `CHANGELOG.md` | Before asking your agent to release |
| `tidy.bat` | `git fetch --prune`, then lists branches and tags | A quick look at what's left over |
| `docs.bat [--fmt]` | Checks links, wikilinks and the TOON blocks in the docs; `--fmt` rewrites the blocks tidily | After editing `CR\*.md` |

`_need.bat` is the shared helper that checks for tools; it isn't meant to be run alone.

## Rules for these files
- One job per file, a few lines, a one-line `rem` on top saying what it is for.
- Start with `cd /d "%~dp0..\.."` so it works from any folder; never write a drive letter or a user name into a path.
- Check tools with `call "%~dp0_need.bat" <tools> || exit /b 1`; stop on the first failure with `|| exit /b 1` or `|| goto :failed`.
- Keep `<`, `>`, `|`, `&` and `%` out of `rem` and `echo` text, or escape them with `^`.
- The files keep CRLF line endings on every OS (`.gitattributes`). Add a new one to the table above; `docs.bat` fails if one is missing.
- The same commands, for macOS and Linux shells, are in the **Launch** section of [[CR]].
