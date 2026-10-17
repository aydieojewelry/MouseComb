# Agent guide

- `APP_SPEC.md` is the single source of truth. Read it and the top entry of `DEVLOG.md` before working. Don't read anything else for context unless the task needs it.
- Cite IDs (`FEAT-xxx`, `DEC-xxx`). Update `APP_SPEC.md` in the same change when behavior, config or status changes.
- At the end of a session: add a `DEVLOG.md` entry and bump `build` in `APP_SPEC.md` §1.
- Pre-production: no tags, releases or CHANGELOG. Use worktrees for experiments (`APP_SPEC.md` §8).
- Input-layer rules in `APP_SPEC.md` §2 are non-negotiable: hook callbacks stay trivial, nothing is ever left held down, injected events are tagged.
- `crates/mc-core` must not call OS APIs (it's shared with mobile).
- Extensions never run on the input path and never get raw hooks. Every host-API call checks the manifest's permissions (`APP_SPEC.md` §5 FEAT-016, §6).
- New capabilities go in as actions first (FEAT-013), so they're bindable, usable in workflows and callable by extensions.
- Bundled extensions in `extensions/` use only the public `@mousecomb/api`. If they need something private, add it to the API instead.
- UI uses only the design tokens in `APP_SPEC.md` §1.
