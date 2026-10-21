---
name: steward
description: Drive a MouseComb change from branch to merged and released. Use when starting work on a change, fixing CI on a pull request, answering review comments, merging, or preparing a release.
---

# Steward: branch → green → approved → merged → released

`CR/PIPELINE.md` explains the whole loop; this is the procedure. Read `CLAUDE.md` and `CR/CR.md` first (rules, commands, `>resume`).

## 1. Start
- Read `CR/CR.md`, `## Next` in `CHANGELOG.md`, the part of `CR/APP_SPEC.md` you're changing (by `FEAT-xxx`) and the top entry of `CR/DEVLOG.md`.
- Sync: `git fetch origin` then work on your assigned branch, rebased or merged onto `origin/main`. Never commit to `main` directly.

## 2. Build-test loop (repeat until everything passes)
```sh
cd services/pocketbase && go run . serve --http 127.0.0.1:8090 &   # live backend for sync tests
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
MC_TEST_PB_URL=http://127.0.0.1:8090 cargo test --workspace
pnpm -r typecheck && pnpm -r test && node --test "scripts/*.test.mjs"
node scripts/docs-check.mjs
pnpm --filter @mousecomb/desktop build
cargo check -p mousecomb-desktop --target x86_64-pc-windows-gnu      # when Rust changed
pnpm bindings && git diff --exit-code packages/bindings              # when a command/event changed
```
- UI change: look at it (browser preview or the real app) before calling it done.
- A failing test is information. Fix the code or the test's wrong assumption; never skip, disable or delete a test to get green.

## 3. Commit
- One purpose per commit. Start the subject with a label: `uplift!:` (needs migration), `feat:` (new feature), `patch:` (changed/improved feature), `fix:` (bug), or `docs:`/`chore:`/`test:`/`ci:`. Labels keep history readable; they don't decide the version.
- The same change updates `CR/APP_SPEC.md` (behavior, status), `CR/DEVLOG.md` (session entry), the Documents table in `README.md` (any new human-readable file) and `CR/CR.md` (`now`, `next`) when they changed.
- User-facing change: add a bullet under `## Next` in `CHANGELOG.md`, under the right sub-heading (Features, Functionality, Hotkeys, Core ideas, Changes, Fixes).

## 4. Pull request
- PR into `main`. Title starts with the label. Fill in `.github/pull_request_template.md`.
- CI red: read the failing job's log, reproduce locally, fix, push. Repeat until green.
- Review comments: apply small asks; for large or design-level asks, reply with a proposal and wait for the owner.

## 5. Merge
- Only when **CI is green and the owner has approved**. Squash merge by default (a merge commit when history should show a hand-off node); delete the branch.
- Never bypass branch protection, force-push `main`, or merge your own PR without the owner's approval.

## 6. Release
- Releases happen only through `.github/workflows/release.yml`, from `main`. The owner approves the `release` environment; agents don't approve it.
- Preview: `node scripts/version.mjs status`. Cut: `node scripts/version.mjs release` (turns `## Next` into the numbered section; `--dry` to look) in the PR that ships the change. The merge to `main` starts the workflow.
- Hotfix (no branch): Actions → Release → Run workflow on `main` with the fix text; same `x.y.z`, `b`+1. Record it under `## Next` → Fixes afterwards.
- After a release: name the version in the `CR/DEVLOG.md` entry and refresh `CR/CR.md`.

## Stop and ask the owner when
- a change needs a data migration (`uplift!`), touches privacy or telemetry rules, or changes what users are charged for;
- CI fails for a reason outside the change (runner, network, secrets);
- a release health signal (M2) says a rollout should pause.
