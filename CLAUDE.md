# Agent guide

- `APP_SPEC.md` is the single source of truth. Read it and the top entry of `DEVLOG.md` before working. Don't read anything else for context unless the task needs it.
- Cite IDs (`FEAT-xxx`, `DEC-xxx`). Update `APP_SPEC.md` in the same change when behavior, data, config or status changes.
- At the end of a session: add a `DEVLOG.md` entry and bump `build` in `APP_SPEC.md` §1.
- Versioning follows `VERSIONING.md` (`x.y.z+b`: main feature, minor change, fix, build). Start commit messages with `feat:`/`uplift!:`, `patch:`, `fix:` (or `docs:`/`chore:`/`test:`/`ci:`); the prefix decides the next version. Releases are tags `vX.Y.Z+B` built by the release workflow; only the owner decides to release.
- When you add a human-readable file, add it to the Documents table in `README.md`.
- Delivery: follow `.claude/skills/steward/SKILL.md` (build-test loop → PR with prefixed title → owner approval → squash merge). Never commit to `main`, never approve or merge without the owner, releases only via the release workflow (`PIPELINE.md`).

## Commands
- Backend: `cd services/pocketbase && go run . serve --http 127.0.0.1:8090` (Go 1.27+).
- Rust: `cargo test --workspace` (set `MC_TEST_PB_URL=http://127.0.0.1:8090` to include live backend tests), `cargo clippy --workspace --all-targets`, `cargo fmt --all`.
- Windows check from Linux: `cargo check -p mousecomb-desktop --target x86_64-pc-windows-gnu`.
- After changing a Tauri command or event: `pnpm bindings` (regenerates `packages/bindings`).
- Frontend: `pnpm -r typecheck`, `pnpm -r test`, `pnpm --filter @mousecomb/desktop build`.
- Release script: `node --test "scripts/*.test.mjs"` (tests), `node scripts/version.mjs next` (what the next release would be).
- UI in a plain browser with example data: `pnpm --filter @mousecomb/desktop dev`, open http://localhost:1420.
- pnpm only installs versions published 14+ days ago (`minimumReleaseAge`); don't override it.

## Rust
- Input-layer rules in `APP_SPEC.md` §3 are non-negotiable: hook callbacks stay trivial, the binding resolver reads an in-memory snapshot, nothing is ever left held down, injected events are tagged.
- `crates/mc-core` must not call OS APIs (it's shared with mobile). OS code goes in `mc-win` (and later per-platform crates).
- Extensions never run on the input path and never get raw hooks. Every host-API call checks the manifest's permissions (§7 FEAT-016, §8).
- New capabilities go in as actions first (FEAT-013), so they're bindable, usable in workflows and callable by extensions.
- Every Tauri command and event is typed with `tauri-specta`; regenerate `packages/bindings` instead of hand-writing TS types. JSON fields use the `Json` newtype / `specta_typescript::Unknown` (specta-typescript 0.0.12 loops on `serde_json::Value`).
- All backend access goes through the `mc_sync::Backend` trait. License and sync code never blocks or gates core features (§9).
- Schema changes to the backend are Go migrations in `services/pocketbase/migrations`; new item kinds need none.

## React
- UI primitives and icons come from `packages/ui` (Ark UI / Zag.js styled with the tokens in §1). Don't add another component or icon library.
- App data goes through `packages/data`: TanStack DB collections for live records (`createItemCollection`), TanStack Query for one-off calls. No `useEffect` data fetching, no duplicate client-side copies of store data.
- Lists that can grow use TanStack Virtual; tables use TanStack Table; forms use TanStack Form + Zod.
- Before using a TanStack library, read its bundled agent skills (`node_modules/@tanstack/*/skills/**/SKILL.md`, e.g. `db-core/custom-adapter`, `react-db`, `router-core`) and follow them.
- Update `packages/data/src/testing/mockBackend.ts` when a command changes, so tests and the browser preview keep working.
- Bundled extensions in `extensions/` use only the public `@mousecomb/api`. If they need something private, add it to the API instead.
