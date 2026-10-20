# MouseComb delivery pipeline

How a change goes from an idea to every user's PC. Written for people and AI agents (Claude Code, Antigravity, others). Agents follow the step-by-step version in [`.claude/skills/steward/SKILL.md`](.claude/skills/steward/SKILL.md).

```mermaid
flowchart LR
  P["1 · Plan<br/>issue, spec, usage report"] --> B["2 · Build loop<br/>agent branch: pull, code,<br/>build + test until green"]
  B --> R["3 · Review<br/>PR, CI, owner approves"]
  R --> M["4 · Merge<br/>squash into main"]
  M --> S["5 · Release<br/>weekly, owner approves,<br/>signed installer"]
  S --> U["6 · Users<br/>auto-update,<br/>staged rollout"]
  U --> I["7 · Insights add-on<br/>opt-in usage, health,<br/>weekly report"]
  I --> P
```

| Step | Who | Where | Human gate |
|---|---|---|---|
| 1 Plan | Owner, agents | GitHub issues, `APP_SPEC.md`, `reports/usage/` | Owner picks what's next |
| 2 Build loop | AI agent | Its own branch (`claude/…`, `agent/…`) | — |
| 3 Review | CI + owner | Pull request | **Owner approves the PR** |
| 4 Merge | Owner or agent after approval | `main` | Only after approval and green CI |
| 5 Release | Release workflow | GitHub Release | **Owner approves the `release` environment** |
| 6 Users | Updater in the app | Every install | Rollout pauses itself if health drops (M2) |
| 7 Insights | Insights add-on | Backend + repo report | — |

## 1 · Plan
- Work starts from an issue or an `APP_SPEC.md` milestone item, cited by ID (`FEAT-xxx`).
- From M2 on, the weekly usage report (`reports/usage/YYYY-Www.md`) is an input: what people use, what crashes, what nobody finds.

## 2 · Build loop (agent)
1. Pull: `git fetch origin && git checkout -B <branch> origin/main`.
2. Make the change. Keep it to one purpose.
3. Run the checks until all pass (the same ones CI runs):
   - backend running: `cd services/pocketbase && go run . serve --http 127.0.0.1:8090`
   - `cargo fmt --all && cargo clippy --workspace --all-targets -- -D warnings`
   - `MC_TEST_PB_URL=http://127.0.0.1:8090 cargo test --workspace`
   - `pnpm -r typecheck && pnpm -r test && node --test "scripts/*.test.mjs"`
   - `pnpm --filter @mousecomb/desktop build`
   - after changing a Tauri command: `pnpm bindings`
   - Windows check from Linux: `cargo check -p mousecomb-desktop --target x86_64-pc-windows-gnu`
4. For UI changes, look at the result: browser preview (`pnpm --filter @mousecomb/desktop dev`) or the real app.
5. Commit with a version prefix (`uplift!:`, `feat:`, `patch:`, `fix:`, `docs:`, `chore:`, `test:`, `ci:`) and push.

## 3 · Review
- Open a pull request into `main`. **The PR title carries the version prefix**; it becomes the squash-merge commit that decides the next version (VERSIONING.md).
- CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs these jobs: Rust (format, lint, tests against a live backend, bindings check), Backend (Go), Frontend (types, tests, build), and Installers for Windows and Linux (unsigned test installers you can download from the run).
- Red CI: the agent fixes and pushes again. It never skips or disables a test.
- The owner (see [`.github/CODEOWNERS`](.github/CODEOWNERS)) reviews and approves.

## 4 · Merge
- Squash merge only, after approval and green CI. Delete the branch.
- `main` must always be releasable.

## 5 · Release
- [`.github/workflows/release.yml`](.github/workflows/release.yml) runs every Tuesday and on demand:
  1. A push that adds a new version section to `CHANGELOG.md` (or a pushed tag `vX.Y.Z+B`) releases exactly that version, with its `CHANGELOG.md` section as notes. Otherwise `scripts/version.mjs next` reads commits since the last tag and picks the next `x.y.z+b`; no `feat`/`patch`/`fix`/`uplift` commits means no release.
  2. **Waits for the owner to approve** the `release` environment.
  3. Creates a draft release, builds and signs the Windows installers (NSIS, MSI) on a Windows runner and the Linux packages (AppImage, .deb, .rpm) on Ubuntu 22.04 in parallel, tags `vX.Y.Z+B`, and publishes the release with grouped notes and one `latest.json` for both platforms.
- Hotfix: merge a `fix:` PR, then run the workflow by hand.
- After a release, an agent updates `CHANGELOG.md` from the release notes (`docs:` commit).

## 6 · Users
- The app checks for updates at start and every 24 h, downloads in the background, installs on restart (FEAT-022).
- **Staged rollout (M2):** the update check goes to the backend instead of a static file. A new version reaches 10 % of installs first, then 50 %, then everyone, and stops if the Insights add-on reports worse health than the previous version.

## 7 · Insights add-on (M2, subproject `services/insights`)
A separate, optional subproject. The app works fully without it.

| Part | What it does |
|---|---|
| Ingest | Reads the opt-in `telemetry` events from the backend once a day |
| Health | Crash-free sessions and error rates per version; compares a new version with the previous one |
| Trends | Feature adoption over time (OmniBar, Pomodoro, quick commands, sync) |
| Basic ML | Anomaly detection on daily rates (rolling baseline, alert on big deviations); grouping installs by usage pattern (k-means on feature counts) to see what kinds of users exist |
| Outputs | `reports/usage/YYYY-Www.md` (aggregates only) via a PR; a release health signal for staged rollout; issues for anomalies |

Privacy rules (FEAT-024, DEC-018) apply to everything here: opt-in only, counts only, no typed text, clipboard, snippets, window titles or file names, no per-user rows in reports.

## One-time setup on GitHub (owner)
1. **Branch protection on `main`:** require a pull request, 1 approval from code owners, and these checks to pass: `Rust (lint + tests with live backend)`, `Backend (Go)`, `Frontend (types, tests, build)`, `Installers (Windows)`, `Installers (Linux)`. Block force pushes. Allow squash merge only.
2. **Environment `release`:** add yourself as a required reviewer.
3. **Updater signing key** (once, keep it safe; losing it means installed apps can't update):
   - run `pnpm --filter @mousecomb/desktop tauri signer generate -w ~/.tauri/mousecomb.key`;
   - save the private key file's contents and its password as **secrets** `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`;
   - save the public key (`~/.tauri/mousecomb.key.pub`) as the **variable** `MOUSECOMB_UPDATER_PUBKEY`. The release workflow writes it into the app; without it the release stops with a clear message.
4. **Backend:** host `services/pocketbase` (free VM, see its README), set up SMTP in its dashboard so password-reset emails go out, and save its address as the **variable** `MOUSECOMB_DEFAULT_SERVER`.
5. **Turn releases on:** set the **variable** `RELEASES_ENABLED=true`, then run the Release workflow (Actions → Release → Run workflow) or wait for Tuesday. The first release is `0.1.0.0+b`.
6. Release downloads are public because this repo is public (DEC-019). If it ever goes private, publish releases to a public `mousecomb-releases` repo instead and change the updater address.
