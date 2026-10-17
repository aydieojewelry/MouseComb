# For AI coding agents

This repo is built with AI agents (Claude Code, Antigravity, Codex, Cursor, …). Read these, in order:

1. [`CLAUDE.md`](CLAUDE.md): project rules and commands. They apply to every agent, not only Claude.
2. [`APP_SPEC.md`](APP_SPEC.md): what to build (single source of truth).
3. [`PIPELINE.md`](PIPELINE.md): how a change gets from your branch to users. The step-by-step procedure is [`.claude/skills/steward/SKILL.md`](.claude/skills/steward/SKILL.md).
4. [`VERSIONING.md`](VERSIONING.md): commit prefixes decide the next version.

Never commit to `main`, merge without the owner's approval, or skip a failing test.
