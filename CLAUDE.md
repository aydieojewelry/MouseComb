# Agent guide

- `APP_SPEC.md` is the single source of truth. Read it and the top entry of `DEVLOG.md` before working. Don't read anything else for context unless the task needs it.
- Cite IDs (`FEAT-xxx`, `DEC-xxx`). Update `APP_SPEC.md` in the same change when behavior, data, config or status changes.
- At the end of a session: add a `DEVLOG.md` entry and bump `build` in `APP_SPEC.md` §1.
- Pre-production: no tags, releases or CHANGELOG. Use worktrees for experiments (`APP_SPEC.md` §13).

## Rust
- Input-layer rules in `APP_SPEC.md` §3 are non-negotiable: hook callbacks stay trivial, the binding resolver reads an in-memory snapshot, nothing is ever left held down, injected events are tagged.
- `crates/mc-core` must not call OS APIs (it's shared with mobile). OS code goes in `mc-win` (and later per-platform crates).
- Extensions never run on the input path and never get raw hooks. Every host-API call checks the manifest's permissions (§7 FEAT-016, §8).
- New capabilities go in as actions first (FEAT-013), so they're bindable, usable in workflows and callable by extensions.
- Every Tauri command and event is typed with `tauri-specta`; regenerate `packages/bindings` instead of hand-writing TS types.
- License and sync code never blocks or gates core features (§9).

## React
- UI primitives come from `packages/ui` (Ark UI / Zag.js styled with the tokens in §1). Don't add another component library.
- App data goes through `packages/data`: TanStack DB collections for live records, TanStack Query for one-off calls. No `useEffect` data fetching, no duplicate client-side copies of store data.
- Lists that can grow use TanStack Virtual; tables use TanStack Table; forms use TanStack Form + Zod.
- Before using a TanStack library, check its package in `node_modules/@tanstack/*` for bundled agent skill files (e.g. TanStack DB ships `skills/**/SKILL.md`) and follow them.
- Bundled extensions in `extensions/` use only the public `@mousecomb/api`. If they need something private, add it to the API instead.
